/**
 * Interrupt manager service.
 * Detects new user input while agent is speaking, stops audio, clears text,
 * sends interrupt frame then new user_message.
 */

import type { AudioChain } from '../audio/audioChain';
import { useConversationStore } from '../stores/conversationStore';

export interface InterruptManager {
  interrupt(sendInterrupt: (turnIndex: number) => void): void;
}

export function createInterruptManager(audioChain: AudioChain): InterruptManager {
  return {
    interrupt(sendInterrupt) {
      // Stop audio playback immediately
      audioChain.stop();

      // Clear progressive text
      const store = useConversationStore.getState();
      store.setFullText('');

      // Send interrupt frame with current turnIndex
      sendInterrupt(store.currentTurnIndex);
    },
  };
}
