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
    sendMessage(sender, getPromptForEmail(eventLang(event)), undefined, undefined, from);
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
        getInvalidEmailMessage(eventLang(event)),
        undefined,
        undefined,
        from,
      );
      return true;
    }
    // @ts-ignore regex is tested above
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

      const [, segmentData] = await Promise.all([
        // getReadyToOrderMessage is fetched inside sendReadyToOrder
        Promise.resolve(),
        checkSegmentTraits(attendeeRecord.email),
      ]);

      const { SEGMENT_TRAIT_CHECK = "" } = process.env;
      // Anyone already found in Segment may not take part (client rule).
      const blocked =
        cafeRules.blockIfFoundInSegment && segmentData.foundInSegment === true;
      await updateSyncMapItem(
        NEXT_PUBLIC_ATTENDEES_MAP,
        phone,
        {
          stage: blocked ? Stages.BLOCKED : Stages.VERIFIED_USER,
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
      // Send the verified lead to the client's database. Never blocks the flow.
      await sendLead(
        buildLead(
          {
            ...attendeeRecord,
            stage: blocked ? Stages.BLOCKED : Stages.VERIFIED_USER,
            foundInSegment: segmentData.foundInSegment,
          },
          event,
        ),
      );
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

  return false;
}
