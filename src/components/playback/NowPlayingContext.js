import { createContext, useContext } from 'react';

// Consumers receive a read function so timing and ownership are checked at
// consumption time. Transport and presentation subscriptions stay independent.
export const NowPlayingContext = createContext(null);
export const useNowPlayingReader = () => useContext(NowPlayingContext);
