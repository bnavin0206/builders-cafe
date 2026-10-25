import twilio from "twilio";
import { writeFileSync } from "fs";
import { isCompletedSignup, leadRow, LEAD_HEADER } from "@/lib/cafe/leads";
import type { AttendeeRecord } from "@/types";

const {
  TWILIO_API_KEY = "",
  TWILIO_API_SECRET = "",
  TWILIO_ACCOUNT_SID = "",
  TWILIO_SYNC_SERVICE_SID = "",
} = process.env;

const client = twilio(TWILIO_API_KEY, TWILIO_API_SECRET, {
  accountSid: TWILIO_ACCOUNT_SID,
});

const eventName = process.argv.pop();

if (!eventName || eventName.startsWith("/") || eventName.includes("=")) {
  console.error(
    "Please provide an event name as the last argument, e.g. 'pnpm download wearedevs24'",
  );
  process.exit(1);
}

(async () => {
  let attendeePage = await client.sync.v1
    .services(TWILIO_SYNC_SERVICE_SID)
    .syncMaps("Attendees")
    .syncMapItems.page({ pageSize: 200 });

  let verifiedAttendees: any[] = [];

  while (attendeePage && attendeePage.instances.length > 0) {
    const attendees = attendeePage.instances
      // @ts-ignore  thinks is a object but actually it's a user
      .map((item) => item.data as AttendeeRecord)
      .filter((a) => isCompletedSignup(a) && a.event === eventName);

    verifiedAttendees = verifiedAttendees.concat(attendees);

    // @ts-ignore
    attendeePage = await attendeePage.nextPage();
  }

  try {
    const csv = verifiedAttendees.map(leadRow);
    writeFileSync(
      `attendees-${eventName}.csv`,
      `${LEAD_HEADER.join(",")}\n${csv.join("\n")}`,
    );
    console.log(`Exported ${csv.length} attendees to attendees-${eventName}.csv`);
  } catch (e) {
    console.error(e);
  }
})();
