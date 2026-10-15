// Treat a missing transport as deferred work, not a failed local preference save.
export function isConnectionUnavailable(error){
  const code=Number(error?.errCode??error?.code);
  return [10000,10001,10003,10006].includes(code)||/disconnect|not connected|no connection|connect (?:a |the |your )?(?:T100|KCALACK|device).*first|offline|bluetooth.*(?:unavailable|not available|not enabled)|bridge.*unavailable|ECONNREFUSED/i.test(String(error?.message||error?.errMsg||error));
}
