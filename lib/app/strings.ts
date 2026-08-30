/**
 * Every visible string on `/app/*`, in one place.
 *
 * `AGENTS.md` requires UI copy to come from `messages/{en,zh}.json`, and this file is a deliberate,
 * recorded exception for phase-03. next-intl is server-only by phase-02's design — no
 * `NextIntlClientProvider`, no client hooks — and `/app` is almost entirely client components with
 * copy that is composed at runtime from parse results. Threading every one of these through props
 * from a server component would buy nothing and cost the shape of the code.
 *
 * The exception is scoped, not open-ended: this module is the whole of it, English is the only
 * locale `/app` claims, and moving it into the catalogues is one file's work when the app UI is
 * translated. Copy voice is 01-PRODUCT.md §6 — warm, plain, talks to a smart 16-year-old as a peer.
 */
export const appStrings = {
  hub: {
    title: 'Your workspace',
    lead: 'Everything here stays on this device until you sign in. Nothing is uploaded.',
    newCta: 'New study guide',
    resumeHeading: 'Pick up where you left off',
    resumeEmptyTitle: 'Nothing in progress',
    resumeEmptyBody:
      'Drop in the notes you already have — a Word file, a PDF, a photo of the whiteboard — and ' +
      'we will read them here in your browser.',
    notesHeading: 'Ready to generate',
    draftMeta: (blocks: number, sources: number) =>
      `${blocks} ${blocks === 1 ? 'block' : 'blocks'} · ${sources} ${sources === 1 ? 'source' : 'sources'}`,
    discard: 'Discard',
    discarded: 'Draft discarded.',
    continueCta: 'Continue',
  },

  new: {
    title: 'New study guide',
    lead:
      'Upload the notes you already have. We read them in your browser — nothing is sent ' +
      'anywhere until you press the button.',
    pasteLabel: 'Or paste your notes',
    pasteHint: 'Paste from anywhere. We will tidy the formatting.',
    pastePlaceholder: 'Paste your notes here…',
    pasteCta: 'Add pasted notes',
    pasteAdded: 'Added your pasted notes.',
    cameraCta: 'Take a photo',
    reviewCta: 'Review what we found',
    parsing: 'Reading your files…',
    emptyHint: 'Add a file or paste some notes to carry on.',
    readSummary: (chars: number, pages: number, scans: number) => {
      const parts = [
        `${chars.toLocaleString('en')} characters`,
        `${pages} ${pages === 1 ? 'page' : 'pages'}`,
      ];
      if (scans > 0) parts.push(`${scans} needing OCR`);
      return `Read ${parts.join(' · ')}.`;
    },
    privacyNote:
      'Parsing happens on this device. The only thing that ever leaves it is the text you ' +
      'choose to send, when you press "Create study guide".',
    passwordTitle: 'This PDF is locked',
    passwordBody:
      'Type the password and we will open it here, in your browser. It is never sent anywhere.',
    passwordLabel: 'Password',
    passwordCta: 'Unlock',
    passwordCancel: 'Skip this file',
  },

  review: {
    title: 'Check what we read',
    lead:
      'Fix anything we got wrong before we start. This is the cheapest place to catch a mistake ' +
      '— everything here is free.',
    leftHeading: 'Your notes',
    rightHeading: 'What these notes are',
    optionsHeading: 'How much should we do?',
    createCta: 'Create study guide',
    backCta: 'Add more files',
    blockCount: (count: number) => `${count} ${count === 1 ? 'block' : 'blocks'}`,
    emptyTitle: 'Nothing to review yet',
    emptyBody: 'Add a file or paste your notes first.',
    emptyCta: 'Add notes',
    splitCta: 'Split into two lessons here',
    splitDone: 'Split. The second half is waiting on your workspace.',
    oneLessonCta: 'These are all one lesson',
    oneLessonDone: 'Good — we will treat them as one.',
    multiSourceHint: (count: number) =>
      `${count} files, treated as one lesson. Split them if they are separate.`,
    ocrCta: 'Run OCR',
    ocrCost: '≈ 1 credit',
    ocrSoon: 'OCR arrives with generation — coming soon',
    ocrFailed:
      'We could not read that page. Your allowance was not touched — try again, or type what it ' +
      'says into the block.',
    ocrPending: (count: number) =>
      `${count} ${count === 1 ? 'page has' : 'pages have'} no text we could read. Run OCR on ` +
      `${count === 1 ? 'it' : 'them'}, or carry on without ${count === 1 ? 'it' : 'them'}.`,
    overCap: (chars: number, max: number) =>
      `These notes are ${chars.toLocaleString('en')} characters and we work with ` +
      `${max.toLocaleString('en')} at a time. We will use the first ${max.toLocaleString('en')} — ` +
      `delete what you do not need, or split the lesson.`,
    noPackTitle: 'No curriculum pack for this course',
    noPackBody:
      'That is fine — generic expert mode still fact-checks, finishes your examples and marks ' +
      'what it changed. A pack only adds the exam board’s own scope and conventions.',
    packBody: (name: string) => `${name} — we will align to its published scope and conventions.`,
    detectingTitle: 'We are guessing',
    detectingBody:
      'Your notes did not say what course this is. Setting it picks the right vocabulary and ' +
      'the right exam conventions, and it takes ten seconds.',
    offline: 'Offline — everything on this screen still works. Only OCR needs a connection.',
    createdToast: 'Draft saved. Generation arrives in the next phase.',
  },

  blocks: {
    deleteLabel: (marker: string) => `Delete block from ${marker}`,
    mergeLabel: (marker: string) => `Merge block from ${marker} into the one above`,
    upLabel: (marker: string) => `Move block from ${marker} up`,
    downLabel: (marker: string) => `Move block from ${marker} down`,
    editLabel: (marker: string) => `Text of the block from ${marker}`,
    scanBadge: 'No text layer',
    editedBadge: 'Edited',
    imageAlt: (marker: string) => `Scanned page: ${marker}`,
  },

  context: {
    subject: 'Subject',
    subjectHint: 'What the class is. "Chemistry", not "AP Chemistry".',
    curriculum: 'Curriculum',
    course: 'Course',
    courseHint: 'What your school calls it. Type your own if it is not listed.',
    unit: 'Unit or topic',
    unitHint: 'Pre-filled from your headings where we found one.',
    language: 'Language of the notes',
    keepLanguage: 'Answer in the same language',
    keepLanguageHint: 'Off means we answer in English.',
    detected: (confidence: number) => `Detected locally · ${Math.round(confidence * 100)}% sure`,
    detectedByModel: 'Checked with the classifier',
    setByYou: 'Set by you',
  },

  note: {
    readyTitle: 'Ready to generate',
    readyBody:
      'Your notes are saved on this device and everything is set. Start when you are ready — ' +
      'it takes about half a minute.',
    startCta: 'Rebuild my notes',
    backToReview: 'Back to review',
    missingTitle: 'We could not find that note',
    missingBody: 'It may have been on another device, or cleared with your browsing data.',
    missingCta: 'Start a new one',
    sourceLine: (files: number, chars: number) =>
      `${files} ${files === 1 ? 'source' : 'sources'} · ${chars.toLocaleString('en')} characters`,
  },

  generate: {
    starting: 'Reading your notes…',
    cancel: 'Stop',
    cancelled: 'Stopped. What arrived is kept as a draft.',
    resumeTitle: 'This one did not finish',
    resumeBody:
      'The last attempt stopped part-way — a closed tab, a lost connection, or you asked it to. ' +
      'What arrived is below, and starting again does not cost you the first attempt.',
    resumeCta: 'Try again',
    keepPartial: 'Keep this draft',
    partialBanner:
      'This is a partial study guide — generation stopped before it finished. Try again when you have a moment.',
    degradedBanner:
      'Some parts of this did not come back cleanly and were left out rather than guessed at. Generating again usually fixes it.',
    revisedBanner: 'We revised several points after a second check. They are marked in the text.',
    rebuiltWith: (model: string) => `Rebuilt with ${model}`,

    errorTitle: 'That did not finish',
    errorRetry: 'Try again',
    errorKeep: 'Back to review',

    refusedTitle: 'These do not look like class notes',
    refusedBody:
      'Lumen rebuilds notes from a lesson into a study guide. It will not write an essay, do a ' +
      'problem set, or work as a general chatbot — that is a deliberate limit, not a failure.',
    refusedReason: (reason: string) => `What the model said: ${reason}`,
    refusedCta: 'Use different notes',
    refusedFree: 'You have not been charged for this.',

    quotaTitle: 'That is all the free study guides for today',
    quotaBody: (resets: string) =>
      `Your free allowance comes back ${resets}. Two things you can do right now:`,
    quotaBodyNoReset: 'Two things you can do right now:',
    quotaKeyCta: 'Add your own API key',
    quotaKeyHint: 'Free to do, removes the daily limit, and your key never leaves our server.',
    quotaSampleCta: 'See a finished example',
    quotaSampleHint: 'The AP Chemistry lesson this was built around, in full.',

    capTitle: "We have hit today's community limit",
    capBody:
      'Lumen is free and the shared budget runs out some days. Your notes are safe on this ' +
      'device — nothing has been lost.',

    pausedTitle: 'Rebuilding is paused',
    pausedBody:
      'We have stopped generation for a moment, usually because something is wrong on our side. ' +
      'Your notes are safe on this device. Try again a little later.',
  },

  settings: {
    title: 'Settings',
    lead: 'Everything here is stored on this device.',
    byokHeading: 'Use your own API key',
    byokLead:
      'Lumen is free, which means a shared daily budget and a small daily limit. Your own key ' +
      'removes both. The key is sent to our server once, encrypted there, and only the encrypted ' +
      'form is kept on this device — we cannot read it back, and it is never sent to the browser ' +
      'of anyone you share a note with.',
    byokBilling: 'Your provider bills you directly. Lumen never charges you anything.',
    modelLabel: 'Model',
    modelHint: 'The exact model id, e.g. deepseek-v4-flash or gpt-4.1-mini.',
    baseUrlLabel: 'Base URL',
    baseUrlHint: 'Only for an OpenAI-compatible endpoint. Must start with https://.',
    saved: 'Key saved. Generation will use it from now on.',
    removed: 'Key removed. You are back on the free allowance.',
    savedOn: (date: string) => `Added ${date}`,
    checking: 'Checking that key works…',
    unavailable: 'Saving a key is not available on this deployment yet.',
  },

  turnstile: {
    label: 'Quick check that you are a person',
    hint: 'Cloudflare Turnstile. No cookies, no tracking — it is here so the free tier stays free.',
    failed: 'That check did not pass. Reload the page and try again.',
  },
} as const;
