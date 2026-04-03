export function getPrimaryEmailFromUser(user) {
  const safeUser = user || {};

  if (safeUser.primaryEmailAddress) {
    if (safeUser.primaryEmailAddress.emailAddress) {
      return safeUser.primaryEmailAddress.emailAddress;
    }
  }

  return '';
}

export function getCustomDisplayNameFromUser(user) {
  const safeUser = user || {};
  const unsafeMetadata = safeUser.unsafeMetadata || {};

  if (typeof unsafeMetadata.displayName === 'string') {
    const displayName = unsafeMetadata.displayName.trim();
    if (displayName) {
      return displayName;
    }
  }

  return '';
}

export function getDisplayNameFromUser(user) {
  const safeUser = user || {};
  const customDisplayName = getCustomDisplayNameFromUser(safeUser);
  if (customDisplayName) {
    return customDisplayName;
  }

  if (safeUser.firstName) {
    return safeUser.firstName;
  }

  if (safeUser.fullName) {
    return safeUser.fullName;
  }

  const primaryEmail = getPrimaryEmailFromUser(safeUser);
  if (primaryEmail) {
    return primaryEmail;
  }

  return 'Student';
}
