import React from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { API_BASE_URL, apiPost } from '../lib/api';

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}

export default function useSyncUser() {
  const { getToken } = useAuth();
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  return React.useCallback(async () => {
    try {
      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
      }

      const tokenGetter = getTokenRef.current;
      let token = '';
      if (typeof tokenGetter === 'function') {
        token = await tokenGetter();
      }

      if (!token) {
        return;
      }

      await apiPost('/users/sync', token, {});
    } catch (error) {
      console.log('[FE] sync error:', getErrorMessage(error, 'sync failed'));
    }
  }, []);
}
