import type { LanguageCode } from '../types.ts';

const AUTH_ERROR_MESSAGES: Record<
  LanguageCode,
  {
    cancelledPopup: string;
    popupBlocked: string;
    unauthorizedDomain: (domain: string) => string;
    operationNotAllowed: string;
    userDisabled: string;
    tooManyRequests: string;
    networkFailed: string;
    accountExistsWithDiffCreds: string;
    generic: string;
  }
> = {
  rw: {
    cancelledPopup:
      'Guhitamo konti cyangwa kwinjira byahagaritswe cyangwa idirishya ryarafunzwe. Ongera ugerageze.',
    popupBlocked:
      'Idirishya ryo kwinjira ryahagaritswe na mushakisha yawe (browser). Emerera popups kuri uru rubuga maze wongere ugerageze.',
    unauthorizedDomain: (domain: string) =>
      `Urubuga "${domain}" ntirwemewe muri Firebase Auth. Injira muri Firebase Console -> Authentication -> Settings -> Authorized domains maze wongereho "${domain}".`,
    operationNotAllowed:
      'Kwinjira ukoresheje Google ntibirafungurwa muri Firebase Console -> Authentication -> Sign-in method.',
    userDisabled:
      'Iyi konti yahagaritswe n\'ubuyobozi bwa sisitemu.',
    tooManyRequests:
      'Wagerageje kwinjira inshuro nyinshi mu gihe gito. Tegereza umwanya muto wongere ugerageze.',
    networkFailed:
      'Murandasi yabuze cyangwa yacitse. Genzura interineti yawe maze wongere ugerageze.',
    accountExistsWithDiffCreds:
      'Iyi imeyili isanzwe ifite konti ikoresha ubundi buryo bwo kwinjira.',
    generic:
      'Kwinjira na Google ntibyakunze. Ongera ugerageze mu kanya.',
  },
  en: {
    cancelledPopup:
      'Sign-in was cancelled or the account selection popup was closed. Please try again.',
    popupBlocked:
      'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.',
    unauthorizedDomain: (domain: string) =>
      `The domain "${domain}" is not authorized for OAuth sign-in. Add "${domain}" in Firebase Console -> Authentication -> Settings -> Authorized domains.`,
    operationNotAllowed:
      'Google Sign-In is not enabled in Firebase Console -> Authentication -> Sign-in method.',
    userDisabled:
      'This user account has been disabled by an administrator.',
    tooManyRequests:
      'Too many sign-in attempts in a short time. Please wait a moment and try again.',
    networkFailed:
      'Network error while connecting to Google Sign-In. Please check your internet connection.',
    accountExistsWithDiffCreds:
      'An account already exists with the same email address using a different sign-in method.',
    generic: 'Google sign-in could not be completed. Please try again.',
  },
  fr: {
    cancelledPopup:
      'La sélection du compte ou la connexion a été annulée, ou la fenêtre a été fermée. Veuillez réessayer.',
    popupBlocked:
      'La fenêtre de connexion a été bloquée par votre navigateur. Autorisez les popups et réessayez.',
    unauthorizedDomain: (domain: string) =>
      `Le domaine "${domain}" n'est pas autorisé pour OAuth. Ajoutez "${domain}" dans Firebase Console -> Authentication -> Settings -> Authorized domains.`,
    operationNotAllowed:
      'La connexion Google n\'est pas activée dans Firebase Console -> Authentication -> Sign-in method.',
    userDisabled:
      'Ce compte utilisateur a été désactivé par un administrateur.',
    tooManyRequests:
      'Trop de tentatives de connexion. Veuillez patienter un instant avant de réessayer.',
    networkFailed:
      'Erreur réseau lors de la connexion. Vérifiez votre connexion Internet et réessayez.',
    accountExistsWithDiffCreds:
      'Un compte existe déjà avec cette adresse e-mail via une autre méthode de connexion.',
    generic: 'La connexion avec Google a échoué. Veuillez réessayer.',
  },
};

export function extractFirebaseAuthCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code.toLowerCase();
  }
  if (err instanceof Error) {
    const match = err.message.match(/auth\/[a-z0-9-]+/i);
    if (match) return match[0].toLowerCase();
  }
  return '';
}

export function mapFirebaseAuthError(err: unknown, lang: LanguageCode = 'rw'): string {
  const code = extractFirebaseAuthCode(err);
  const copy = AUTH_ERROR_MESSAGES[lang] || AUTH_ERROR_MESSAGES.rw;
  const currentHost =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'this domain';

  if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
    return copy.cancelledPopup;
  }
  if (code === 'auth/popup-blocked') {
    return copy.popupBlocked;
  }
  if (code === 'auth/unauthorized-domain') {
    return copy.unauthorizedDomain(currentHost);
  }
  if (code === 'auth/operation-not-allowed') {
    return copy.operationNotAllowed;
  }
  if (code === 'auth/user-disabled') {
    return copy.userDisabled;
  }
  if (code === 'auth/too-many-requests') {
    return copy.tooManyRequests;
  }
  if (code === 'auth/network-request-failed') {
    return copy.networkFailed;
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return copy.accountExistsWithDiffCreds;
  }

  return copy.generic;
}
