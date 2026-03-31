// Helpers for distinguishing real NWC connections from internal pseudo-records

export function isInternalConnectionKey(pubkey) {
    return !pubkey || pubkey === '__api__';
}

export function isPersistableConnection(pubkey, info) {
    if (isInternalConnectionKey(pubkey)) return false;
    if (!info || info._virtual) return false;
    return true;
}

export function isRestorableNwcConnection(pubkey, info) {
    if (!isPersistableConnection(pubkey, info)) return false;
    if (info.revoked) return false;
    if (typeof info.mymint !== 'string' || !info.mymint) return false;
    if (typeof info.app_privkey !== 'string' || !info.app_privkey) return false;
    if (typeof info.user_pubkey !== 'string' || !info.user_pubkey) return false;
    return true;
}
