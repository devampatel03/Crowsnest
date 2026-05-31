import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the project root .env or local .env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });


export const config = {
  /** Bot OAuth token — starts with xoxb- */
  slackBotToken: process.env.SLACK_BOT_TOKEN || '',

  /** App-level token for Socket Mode — starts with xapp- */
  slackAppToken: process.env.SLACK_APP_TOKEN || '',

  /** Signing secret used to verify request authenticity */
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET || '',

  /** Base URL of the Crowsnest FastAPI backend */
  crowsnestApiUrl: process.env.CROWSNEST_API_URL || 'http://localhost:8000',

  /** Slack channel where CRITICAL/HIGH alerts are posted */
  alertChannel: process.env.CROWSNEST_ALERT_CHANNEL || '#security',

  /** HTTP port — only used if Socket Mode is disabled */
  port: parseInt(process.env.PORT || '3001', 10),

  /** URL of the Crowsnest Next.js dashboard (for deep-link buttons) */
  dashboardUrl: process.env.CROWSNEST_DASHBOARD_URL || 'http://localhost:3000',
} as const;

/** Validate that required tokens are present; warn but do not crash. */
export function warnMissingConfig(): void {
  const required: Array<keyof typeof config> = [
    'slackBotToken',
    'slackAppToken',
    'slackSigningSecret',
  ];

  for (const key of required) {
    if (!config[key]) {
      console.warn(
        `[config] Warning: ${key} is not set. ` +
          `Set the corresponding environment variable before deploying.`
      );
    }
  }
}
