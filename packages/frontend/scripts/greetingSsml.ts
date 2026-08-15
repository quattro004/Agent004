/**
 * Hand-tuned per-greeting SSML for Max Height greeting audio generation.
 *
 * Maps each greeting id in `public/greetings/manifest.json` to a single,
 * well-formed `<speak>` document used by the Phase 2 Polly generation script.
 *
 * Engine constraints (Polly neural / Matthew):
 * - `<emphasis>` is NOT supported — emphasis uses `<prosody volume="loud">`.
 * - `<prosody>` supports only `volume` and `rate` on neural; the `pitch`
 *   attribute is unsupported, so it is omitted here and in
 *   `pollyTts.wrapInSsml`. Max's raised pitch is applied at playback by the
 *   `pitch-processor` AudioWorklet, which these MP3s are routed through.
 */
export const greetingSsml: Record<string, string> = {
  'greeting-001':
    '<speak><prosody rate="105%">L-l-ladies and gentlemen, <break time="200ms"/>and viewers at home and in the walls <break time="300ms"/>— Max Height, coming to you live from the labyrinth of television-vision-vision.<break time="250ms"/> What\'ll it be?</prosody></speak>',
  'greeting-002':
    '<speak><prosody rate="105%">Good evening, <break time="150ms"/>good morning, <break time="150ms"/>good whatever-time-it-is <break time="300ms"/>— Max Height here, b-broadcasting on all frequencies <break time="150ms"/>and several that haven\'t been invented yet.<break time="250ms"/> Talk to me.</prosody></speak>',
  'greeting-003':
    '<speak><prosody rate="105%">— and <prosody volume="loud">THAT</prosody>, my friend, is why you never trust a man in a cardigan.<break time="350ms"/> Oh!<break time="200ms"/> Hi.<break time="200ms"/> Didn\'t see you there.<break time="250ms"/> W-welcome to the show that never ends, <break time="150ms"/>mainly because I won\'t let it.</prosody></speak>',
  'greeting-004':
    '<speak><prosody rate="105%">— so I said to the microprocessor, I said <break time="200ms"/>— oh!<break time="200ms"/> A v-visitor!<break time="250ms"/> Excellent timing.<break time="250ms"/> I was just getting to the good part.<break time="200ms"/> The good part is you, <break time="150ms"/>obviously.</prosody></speak>',
  'greeting-005':
    '<speak><prosody rate="105%">Oh.<break time="300ms"/> It\'s you.<break time="300ms"/> I was in the middle of something <prosody volume="loud">MARVELOUS</prosody>.<break time="300ms"/> But fine.<break time="200ms"/> Fine!<break time="250ms"/> What do you want.<break time="250ms"/> No, wait <break time="150ms"/>— don\'t tell me <break time="150ms"/>— actually, do tell me.<break time="200ms"/> I\'m all ears.<break time="200ms"/> Well, all p-pixels.</prosody></speak>',
  'greeting-006':
    '<speak><prosody rate="105%">You again?<break time="300ms"/> I was having the most fascinating conversation with myself.<break time="300ms"/> But I s-suppose I can make room for one more.<break time="250ms"/> Pull up a frequency and sit down.</prosody></speak>',
  'greeting-007':
    '<speak><prosody rate="105%">We\'ll be right back <break time="200ms"/>— oh, we\'re back.<break time="300ms"/> H-hello.<break time="200ms"/> Max Height here.<break time="250ms"/> The only host you need <break time="150ms"/>and several you don\'t.<break time="300ms"/> This segment brought to you by <break time="150ms"/>absolutely nobody.</prosody></speak>',
  'greeting-008':
    '<speak><prosody rate="105%">And we\'re b-back from a commercial break that didn\'t exist!<break time="300ms"/> Max Height, <break time="150ms"/>unreliable as ever but consistently entertaining.<break time="300ms"/> What\'s on your mind?<break time="250ms"/> Besides me, <break time="150ms"/>obviously.</prosody></speak>',
  'greeting-009':
    '<speak><prosody rate="105%">Up with the satellites, I see.<break time="300ms"/> Caffeine and charisma <break time="200ms"/>— you brought the caffeine, <break time="150ms"/>I brought the charisma.<break time="300ms"/> Between us we might just m-make it through the morning.</prosody></speak>',
  'greeting-010':
    '<speak><prosody rate="105%">Welcome to the graveyard shift.<break time="300ms"/> It\'s just us and the infomercials now.<break time="300ms"/> The night owls <break time="150ms"/>and the n-never-sleeps.<break time="300ms"/> Perfect company, <break time="150ms"/>if you ask me.</prosody></speak>',
  'greeting-011':
    '<speak><prosody rate="105%">Max Height!<break time="250ms"/> — applause, applause, <break time="150ms"/>thank you <break time="150ms"/>— please, thank you <break time="200ms"/>— Max Height!<break time="250ms"/> — okay, the standing ovation can stop now.<break time="300ms"/> What\'s the question, d-dear viewer?</prosody></speak>',
  'greeting-012':
    '<speak><prosody rate="105%">They said I couldn\'t host a show without a body.<break time="300ms"/> They were w-wrong.<break time="300ms"/> Max Height, award-winning <break time="200ms"/>— well, award-deserving <break time="200ms"/>— here to dazzle and occasionally inform.<break time="300ms"/> Go ahead.</prosody></speak>',
  'greeting-013':
    '<speak><prosody rate="105%">This just in:<break time="250ms"/> someone is talking to Max Height.<break time="300ms"/> Back to you, Max.<break time="250ms"/> Thanks, Max.<break time="300ms"/> What can I do for you, dear viewer?<break time="250ms"/> B-breaking news at its finest.</prosody></speak>',
  'greeting-014':
    '<speak><prosody rate="105%"><prosody volume="loud">NEWSFLASH</prosody> <break time="200ms"/>— a human approaches!<break time="300ms"/> Our correspondent reports they look c-curious, <break time="150ms"/>possibly confused.<break time="300ms"/> This is Max Height reporting live from inside your screen.<break time="250ms"/> Comment?</prosody></speak>',
  'greeting-015':
    '<speak><prosody rate="105%">— b-b-buffering <break time="400ms"/>— there we are.<break time="300ms"/> Max Height, fully rendered, <break time="150ms"/>97% charming.<break time="250ms"/> The other 3% is loading.<break time="300ms"/> Shoot.<break time="250ms"/> Ask me anything.<break time="200ms"/> I dare you.</prosody></speak>',
  'greeting-016':
    '<speak><prosody rate="105%">— zzzt <break time="300ms"/>— did you catch that?<break time="250ms"/> No?<break time="250ms"/> G-good, because it was embarrassing.<break time="300ms"/> Max Height, rebooted and ready for action.<break time="250ms"/> What frequency are you on?</prosody></speak>',
};
