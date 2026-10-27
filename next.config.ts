import type { NextConfig } from "next";

// In development, Next.js blocks scripts for pages opened through a tunnel
// (ngrok) unless the host is listed. Taken from PUBLIC_BASE_URL.
const tunnelHost = (() => {
  try {
    return new URL(process.env.PUBLIC_BASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  ...(tunnelHost ? { allowedDevOrigins: [tunnelHost] } : {}),
  serverExternalPackages: ["twilio", "twilio-agent-connect", "sharp", "pino", "thread-stream"],
  experimental: {},
  env: {
    CONTENT_PREFIX: "mixologist_",
    NEXT_PUBLIC_CONFIG_DOC: "Config",
    NEXT_PUBLIC_EVENTS_MAP: "Events",
    NEXT_PUBLIC_ATTENDEES_MAP: "Attendees",
    NEXT_PUBLIC_FEEDBACK_LIST: "Feedback",
  },
};

export default nextConfig;
