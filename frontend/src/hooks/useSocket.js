'use client';
import { useEffect, useRef, useCallback } from 'react';

export function useSocket() {
  const socketRef = useRef(null);

  const joinRoom    = useCallback(() => {}, []);
  const leaveRoom   = useCallback(() => {}, []);
  const sendTyping  = useCallback(() => {}, []);
  const markRead    = useCallback(() => {}, []);

  return { socket: socketRef.current, joinRoom, leaveRoom, sendTyping, markRead };
}