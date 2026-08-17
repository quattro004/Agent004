import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
const mockGetItem = vi.fn((key: string) => mockLocalStorage[key] ?? null);
const mockSetItem = vi.fn((key: string, value: string) => {
  mockLocalStorage[key] = value;
});
const mockRemoveItem = vi.fn((key: string) => {
  delete mockLocalStorage[key];
});

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
    get length() {
      return Object.keys(mockLocalStorage).length;
    },
    key: (index: number) => Object.keys(mockLocalStorage)[index] ?? null,
    clear: () => {
      for (const key of Object.keys(mockLocalStorage)) {
        delete mockLocalStorage[key];
      }
    },
  },
  writable: true,
});

// Mock stores — provide reset() functions to verify they're called
const mockVoiceReset = vi.fn();
const mockConversationReset = vi.fn();
const mockConnectionReset = vi.fn();
const mockVisitorReset = vi.fn();

vi.mock('../../src/stores/voiceStore', () => ({
  useVoiceStore: Object.assign(vi.fn(), {
    getState: () => ({ reset: mockVoiceReset }),
  }),
}));

vi.mock('../../src/stores/conversationStore', () => ({
  useConversationStore: Object.assign(vi.fn(), {
    getState: () => ({ reset: mockConversationReset }),
  }),
}));

vi.mock('../../src/stores/connectionStore', () => ({
  useConnectionStore: Object.assign(vi.fn(), {
    getState: () => ({ reset: mockConnectionReset }),
  }),
}));

vi.mock('../../src/stores/visitorStore', () => ({
  useVisitorStore: Object.assign(vi.fn(), {
    getState: () => ({
      reset: mockVisitorReset,
      actorId: 'test-actor-123',
      displayAlias: 'TestUser',
      greetingHistory: ['g-001', 'g-002'],
    }),
  }),
}));

describe('dataManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock localStorage
    for (const key of Object.keys(mockLocalStorage)) {
      delete mockLocalStorage[key];
    }
  });

  describe('forgetMe', () => {
    it('should remove all max-height-* localStorage keys', async () => {
      // Arrange: populate localStorage with max-height-* keys and others
      mockLocalStorage['max-height-actorId'] = 'abc-123';
      mockLocalStorage['max-height-greeting-history'] = '["g-001"]';
      mockLocalStorage['max-height-settings'] = '{}';
      mockLocalStorage['other-app-key'] = 'should-stay';

      const { forgetMe } = await import('../../src/services/dataManager');
      forgetMe();

      expect(mockRemoveItem).toHaveBeenCalledWith('max-height-actorId');
      expect(mockRemoveItem).toHaveBeenCalledWith('max-height-greeting-history');
      expect(mockRemoveItem).toHaveBeenCalledWith('max-height-settings');
      expect(mockRemoveItem).not.toHaveBeenCalledWith('other-app-key');
    });

    it('should call reset() on all 4 Zustand stores', async () => {
      const { forgetMe } = await import('../../src/services/dataManager');
      forgetMe();

      expect(mockVoiceReset).toHaveBeenCalled();
      expect(mockConversationReset).toHaveBeenCalled();
      expect(mockConnectionReset).toHaveBeenCalled();
      expect(mockVisitorReset).toHaveBeenCalled();
    });
  });

  describe('exportData', () => {
    it('should create a JSON blob with actorId, displayAlias, and greetingHistory', async () => {
      const { exportData } = await import('../../src/services/dataManager');

      // Mock URL.createObjectURL and document.createElement
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      });

      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
      } as unknown as HTMLAnchorElement;
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);

      exportData();

      // Verify blob was created with correct data
      expect(mockCreateObjectURL).toHaveBeenCalled();
      const blobArg = mockCreateObjectURL.mock.calls[0][0] as Blob;
      expect(blobArg).toBeInstanceOf(Blob);

      // Read blob content via FileReader (jsdom compatible)
      const blobText = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(blobArg);
      });
      const parsed = JSON.parse(blobText);
      expect(parsed.actorId).toBe('test-actor-123');
      expect(parsed.displayAlias).toBe('TestUser');
      expect(parsed.greetingHistory).toEqual(['g-001', 'g-002']);

      vi.unstubAllGlobals();
    });

    it('should trigger a download via anchor click', async () => {
      const { exportData } = await import('../../src/services/dataManager');

      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      });

      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
      } as unknown as HTMLAnchorElement;
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);

      exportData();

      expect(mockClick).toHaveBeenCalled();
      expect(mockAnchor.download).toContain('max-height-data');

      vi.unstubAllGlobals();
    });
  });
});
