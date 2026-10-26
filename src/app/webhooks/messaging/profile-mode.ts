// Copyright (c) 2025 Twilio Inc.

"use server";

import {
  sendMessage,
  updateOrCreateSyncMapItem,
  updateSyncMapItem,
  createVerification,
  checkVerification,
} from "@/lib/twilio";
import {
  Stages,
  sleep,
  EventLengthInSeconds,
  regexForEmail,
  regexFor6ConsecutiveDigits,
} from "@/lib/utils";
import { checkSegmentTraits } from "./segment";
import { startCafe } from "@/lib/cafe/start";
import { cafeRules } from "@/config/cafe-rules";
import { buildLead, sendLead } from "@/lib/cafe/leads-sink";
import { msg } from "@/lib/cafe/messages";
import { cleanText } from "@/lib/cafe/text";
import {
  eventLang,
  getDataPolicy,
  getErrorDuringEmailVerificationMessage,
  getInvalidEmailMessage,
  getInvalidVerificationCodeMessage,
  getModifiersMessage,
  getPromptForEmail,
  getSentEmailMessage,
} from "@/lib/stringTemplates";
import type { Event } from "@/types";

const NEXT_PUBLIC_ATTENDEES_MAP =
  process.env.NEXT_PUBLIC_ATTENDEES_MAP || "";

function sanitizeFullName(fullName: string) {
  return fullName
    .replace(/[^a-zA-Z\s\-\.\']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendReadyToOrder(
  sender: string,
  event: Event,
  _isReturning: boolean,
  from: string,
) {
  // Privacy note first, then the quiz.
  sendMessage(
    sender,
    getDataPolicy(event.selection.mode, eventLang(event)),
    undefined,
    undefined,
    from,
  );
  await startCafe(sender, event, from);
}

/**
 * Last sign-up step. Checks Segment, marks the sign-up complete, then blocks
 * the attendee or starts the quiz, and sends the lead on.
 */
async function finishSignup(
  phone: string,
  sender: string,
  record: any,
  event: Event,
  from: string,
) {
  const segmentData = await checkSegmentTraits(record.email);
  const { SEGMENT_TRAIT_CHECK = "" } = process.env;
  // Anyone already found in Segment may not take part (client rule).
  const blocked =
    cafeRules.blockIfFoundInSegment && segmentData.foundInSegment === true;
  const stage = blocked ? Stages.BLOCKED : Stages.VERIFIED_USER;
  await updateSyncMapItem(
    NEXT_PUBLIC_ATTENDEES_MAP,
    phone,
    {
      city: record.city,
      stage,
      completedSignup: true,
      ...(SEGMENT_TRAIT_CHECK
        ? { [SEGMENT_TRAIT_CHECK]: (segmentData as any)[SEGMENT_TRAIT_CHECK] }
        : {}),
      foundInSegment: segmentData.foundInSegment,
    },
    EventLengthInSeconds,
  );

  if (blocked) {
    sendMessage(sender, msg.blocked, undefined, undefined, from);
  } else {
    await sendReadyToOrder(sender, event, false, from);
  }
  // Send the lead to the client's database. Never blocks the flow.
  await sendLead(
    buildLead(
      { ...record, stage, foundInSegment: segmentData.foundInSegment },
      event,
    ),
  );
}

export async function handleProfileMode(
  phone: string,
  sender: string,
  attendeeRecord: any,
  event: Event,
  incomingMessageBody: string,
  leadCollection: string,
  from: string,
): Promise<boolean> {
  const stage = attendeeRecord.stage as Stages;

  // NONE mode: auto-register on first message
  if (leadCollection === "NONE" && stage === Stages.NEW_USER) {
    await updateOrCreateSyncMapItem(
      NEXT_PUBLIC_ATTENDEES_MAP,
      phone,
      { stage: Stages.VERIFIED_USER },
      EventLengthInSeconds,
    );
    await sendReadyToOrder(sender, event, false, from);
    return true;
  }

  // MANUAL mode — already verified / ordering stages: caller handles order flow
  if (
    stage === Stages.VERIFIED_USER ||
    stage === Stages.FIRST_ORDER ||
    stage === Stages.REPEAT_CUSTOMER ||
    stage === Stages.BLOCKED ||
    stage === Stages.QUIZ ||
    stage === Stages.QUIZ_FAILED ||
    stage === Stages.PICK_COFFEE ||
    stage === Stages.PICK_ADDONS ||
    stage === Stages.PICK_EXTRA ||
    stage === Stages.AWAITING_PAYMENT
  ) {
    return false;
  }

  if (stage === Stages.NEW_USER) {
    sendMessage(
      sender,
      cafeRules.verifyEmail ? getPromptForEmail(eventLang(event)) : msg.askEmail,
      undefined,
      undefined,
      from,
    );
    await updateSyncMapItem(
      NEXT_PUBLIC_ATTENDEES_MAP,
      phone,
      {
        fullName: sanitizeFullName(incomingMessageBody),
        stage: Stages.NAME_CONFIRMED,
      },
      EventLengthInSeconds,
    );
    return true;
  }

  if (stage === Stages.NAME_CONFIRMED) {
    if (!incomingMessageBody || !regexForEmail.test(incomingMessageBody)) {
      sendMessage(
        sender,
        cafeRules.verifyEmail ? getInvalidEmailMessage(eventLang(event)) : msg.invalidEmail,
        undefined,
        undefined,
        from,
      );
      return true;
    }
    // @ts-ignore regex is tested above
    const email = incomingMessageBody.match(regexForEmail)[0];
    if (!cafeRules.verifyEmail) {
      // No emailed code: keep the email as typed and ask for the company.
      await updateSyncMapItem(
        NEXT_PUBLIC_ATTENDEES_MAP,
        phone,
        { email, stage: Stages.ASK_COMPANY },
        EventLengthInSeconds,
      );
      sendMessage(sender, msg.askCompany, undefined, undefined, from);
      return true;
    }
    let check;
    try {
      check = await createVerification(email, event);
    } catch (error: any) {
      console.error(error);
      sendMessage(
        sender,
        getErrorDuringEmailVerificationMessage(error.message, eventLang(event)),
        undefined,
        undefined,
        from,
      );
      return true;
    }
    sendMessage(sender, getSentEmailMessage(eventLang(event)), undefined, undefined, from);
    await updateSyncMapItem(
      NEXT_PUBLIC_ATTENDEES_MAP,
      phone,
      { stage: Stages.VERIFYING, email, checkSid: check.sid },
      EventLengthInSeconds,
    );
    return true;
  }

  if (stage === Stages.VERIFYING) {
    // User re-sent an email address — resend verification
    if (regexForEmail.test(incomingMessageBody)) {
      // @ts-ignore regex tested above
      const email = incomingMessageBody.match(regexForEmail)[0];
      let check;
      try {
        check = await createVerification(email, event);
      } catch (error: any) {
        console.error(error);
        sendMessage(
          sender,
          getErrorDuringEmailVerificationMessage(error.message, eventLang(event)),
          undefined,
          undefined,
          from,
        );
        return true;
      }
      sendMessage(sender, getSentEmailMessage(eventLang(event)), undefined, undefined, from);
      await updateSyncMapItem(
        NEXT_PUBLIC_ATTENDEES_MAP,
        phone,
        { checkSid: check.sid, email },
        EventLengthInSeconds,
      );
      return true;
    }

    if (!regexFor6ConsecutiveDigits.test(incomingMessageBody)) {
      sendMessage(
        sender,
        getInvalidVerificationCodeMessage(eventLang(event)),
        undefined,
        undefined,
        from,
      );
      return true;
    }

    try {
      // @ts-ignore regex tested above
      const code = incomingMessageBody.match(regexFor6ConsecutiveDigits)[0];
      const verification = await checkVerification(
        attendeeRecord.checkSid,
        code,
      );
      if (!verification.valid) {
        sendMessage(
          sender,
          getInvalidVerificationCodeMessage(eventLang(event)),
          undefined,
          undefined,
          from,
        );
        return true;
      }

      // Email verified: now ask for the company and city.
      await updateSyncMapItem(
        NEXT_PUBLIC_ATTENDEES_MAP,
        phone,
        { stage: Stages.ASK_COMPANY },
        EventLengthInSeconds,
      );
      sendMessage(sender, msg.askCompany, undefined, undefined, from);
      return true;
    } catch (error) {
      console.error(error);
      sendMessage(
        sender,
        getInvalidVerificationCodeMessage(eventLang(event)),
        undefined,
        undefined,
        from,
      );
      return true;
    }
  }

  if (stage === Stages.ASK_COMPANY) {
    const company = cleanText(incomingMessageBody);
    if (!company) {
      sendMessage(sender, msg.askAgain, undefined, undefined, from);
      sendMessage(sender, msg.askCompany, undefined, undefined, from);
      return true;
    }
    await updateSyncMapItem(
      NEXT_PUBLIC_ATTENDEES_MAP,
      phone,
      { company, stage: Stages.ASK_CITY },
      EventLengthInSeconds,
    );
    sendMessage(sender, msg.askCity, undefined, undefined, from);
    return true;
  }

  if (stage === Stages.ASK_CITY) {
    const city = cleanText(incomingMessageBody);
    if (!city) {
      sendMessage(sender, msg.askAgain, undefined, undefined, from);
      sendMessage(sender, msg.askCity, undefined, undefined, from);
      return true;
    }
    await finishSignup(phone, sender, { ...attendeeRecord, city }, event, from);
    return true;
  }

  if (stage === Stages.ASK_COMPANY) {
    const company = cleanText(incomingMessageBody);
    if (!company) {
      sendMessage(sender, msg.askAgain, undefined, undefined, from);
      sendMessage(sender, msg.askCompany, undefined, undefined, from);
      return true;
    }
    await updateSyncMapItem(
      NEXT_PUBLIC_ATTENDEES_MAP,
      phone,
      { company, stage: Stages.ASK_CITY },
      EventLengthInSeconds,
    );
    sendMessage(sender, msg.askCity, undefined, undefined, from);
    return true;
  }

  if (stage === Stages.ASK_CITY) {
    const city = cleanText(incomingMessageBody);
    if (!city) {
      sendMessage(sender, msg.askAgain, undefined, undefined, from);
      sendMessage(sender, msg.askCity, undefined, undefined, from);
      return true;
    }
    await finishSignup(phone, sender, { ...attendeeRecord, city }, event, from);
    return true;
  }

  return false;
}
