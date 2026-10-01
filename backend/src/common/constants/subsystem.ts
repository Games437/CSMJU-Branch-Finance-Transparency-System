// SUBSYSTEM_SLUG is a PLACEHOLDER: the real csmju2030-standards repo
// requires this to exactly match subsystem.yaml's `name` and the name
// registered with Core Hub (api-conventions.md §8) once real SSO
// integration happens. That official <slug> hasn't been locked by PL yet
// (see the compliance gap report, section 8, item 9). Update this ONE
// constant the moment that name is confirmed — the health check reads
// from here rather than repeating the string.
//
// REVERTED 2026-09-28: this file used to also export the SSO session/
// state cookie names (derived from this same slug) for the real Core Hub
// SSO strategy. That strategy has been removed in favor of the
// dev-header-auth stub again, so only the health-check use remains.
export const SUBSYSTEM_SLUG = 'csmju-bfts'; // PLACEHOLDER — replace with the PL-confirmed subsystem slug
