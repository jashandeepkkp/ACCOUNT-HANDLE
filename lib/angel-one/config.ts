/**
 * Server-only Angel One configuration helpers.
 * Do not import this module into client components.
 */
export type AngelOneReadiness = {
  apiKeyConfigured: boolean;
  clientCodeConfigured: boolean;
  staticIpConfigured: boolean;
  staticIpRegistered: boolean;
  accountAuthorizationVerified: boolean;
};

export function getAngelOneReadiness(): AngelOneReadiness {
  return {
    apiKeyConfigured: Boolean(process.env.ANGELONE_API_KEY),
    clientCodeConfigured: Boolean(process.env.ANGELONE_CLIENT_CODE),
    staticIpConfigured: Boolean(process.env.ANGELONE_STATIC_IP),
    staticIpRegistered: process.env.ANGELONE_STATIC_IP_REGISTERED === "true",
    accountAuthorizationVerified:
      process.env.ANGELONE_ACCOUNT_AUTHORIZED === "true",
  };
}

/** Keep execution locked until a separate reviewed release implements all gates. */
export const ANGELONE_LIVE_EXECUTION_ENABLED = false;
export const ANGELONE_COPY_TRADING_ENABLED = false;
