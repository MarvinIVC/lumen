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
import { AI_DISCLAIMER } from '@/lib/config';

/** What each format is called in a sentence, rather than in a menu. */
const FORMAT_NAMES: Record<string, string> = {
  docx: 'Word document',
  markdown: 'Markdown bundle',
  anki: 'Anki deck',
  pdf: 'PDF',
};

export const appStrings = {
  auth: {
    signIn: 'Sign in',
    account: 'Account',
    title: 'Keep this across devices',
    lead: 'Your notes already work without an account. Sign in when you want the same library on another device.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    magicLink: 'Email me a sign-in link',
    google: 'Continue with Google',
    divider: 'or',
    sending: 'Sending the link…',
    sentTitle: 'Check your email',
    sentBody: (email: string) => `We sent a sign-in link to ${email}. You can close this window.`,
    failed: 'We could not start sign-in. Check the address and try again.',
    googleFailed: 'Google sign-in is not available here. The email link above works now.',
    callbackFailed: 'That sign-in link did not work. It may have expired — ask for a fresh one.',
    signedOut: 'Signed out. Your notes still work on this device.',
    syncing: 'Bringing your library together…',
  },

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

  library: {
    title: 'Your library',
    lead: 'Every lesson, where you can find it again.',
    allNotes: 'All notes',
    treeLabel: 'Subjects, courses, units and lessons',
    newNote: 'New study guide',
    signInNudge: 'Sign in to keep these across devices',
    signInNudgeBody: 'Everything here works locally already. An account adds sync, not permission.',
    offline: 'Offline — changes are saved on this device and will sync when you reconnect.',
    merging: 'Bringing your local and cloud libraries together…',
    synced: 'Synced',
    search: 'Search notes',
    searchPlaceholder: 'Search titles and note text…',
    subjectFilter: 'All subjects',
    curriculumFilter: 'All curricula',
    dateFilter: 'Any date',
    dateWeek: 'Past week',
    dateMonth: 'Past month',
    openQuestionsFilter: 'Has open questions',
    notReviewedFilter: 'Not yet reviewed',
    emptyTitle: 'Your first lesson will live here',
    emptyBody: 'Make a study guide and it will be organised by course and unit automatically.',
    noResultsTitle: 'Nothing matches that search',
    noResultsBody: 'Try fewer words or clear one of the filters.',
    clearFilters: 'Clear filters',
    treeActions: 'Organise library',
    selected: (count: number) => `${count} selected`,
    selectNote: (title: string) => `Select ${title}`,
    move: 'Move',
    delete: 'Delete',
    export: 'Export',
    exportSoon: 'Bulk export arrives with the export tools in phase 07.',
    combineDeck: 'Combine deck',
    combineDeckTitle: 'Combined flashcard deck',
    combineDeckBody: (cards: number, notes: number) =>
      `${cards} ${cards === 1 ? 'card' : 'cards'} from ${notes} ${notes === 1 ? 'lesson' : 'lessons'}.`,
    combineDeckEmpty: 'Those lessons do not have any flashcards yet.',
    close: 'Close',
    moveTitle: 'Move lessons',
    moveBody: 'Choose the unit these lessons belong in.',
    moveHere: 'Move here',
    deleteTitle: 'Delete these lessons?',
    deleteBody: 'They will be removed from this device and from your synced library.',
    deleteConfirm: 'Delete lessons',
    cancel: 'Cancel',
    addCourse: 'Add course',
    addUnit: 'Add unit',
    course: 'Course',
    unit: 'Unit',
    lesson: 'Lesson',
    general: 'General',
    unsorted: 'Unsorted',
    courseNamePlaceholder: 'e.g. AP Chemistry',
    unitNamePlaceholder: 'e.g. Atomic structure',
    rename: 'Rename',
    moveUp: 'Move up',
    moveDown: 'Move down',
    editTitleCourse: 'Course details',
    editTitleUnit: 'Unit details',
    name: 'Name',
    subject: 'Subject',
    curriculum: 'Curriculum',
    color: 'Color',
    colorNone: 'Paper',
    colorAccent: 'Blue ink',
    colorSuccess: 'Green',
    colorWarning: 'Amber',
    save: 'Save',
    moved: 'Lessons moved.',
    deleted: 'Lessons deleted.',
    courseSaved: 'Course saved.',
    unitSaved: 'Unit saved.',
    moveWithMenu:
      'Move selected lessons with the Move button. You can also drag a lesson onto a unit.',
    updated: (date: string) => `Updated ${date}`,
    aiAdded: (count: number) => `${count} AI-added`,
    openQuestions: (count: number) => `${count} to confirm`,
    exported: 'Exported',
    inNotion: 'In Notion',
    localOnly: 'This browser only',
    conflicted: 'Conflicted copy',
    conflictTitle: 'Two versions need a decision',
    keepThis: 'Keep this version',
    keepBoth: 'Keep both',
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

  share: {
    goneTitle: 'This link is not available',
    goneBody:
      'It may have been turned off by whoever shared it, or it may have expired. Ask them for a ' +
      'new one — nothing has been lost on their side.',
    busyTitle: 'This link is busy right now',
    busyBody: 'It is being opened a lot at the moment. Try again in a minute.',
    cta: 'Rebuild your own notes',
    madeWith: 'Made with',
    tagline: 'Turn the notes you already have into a study guide.',
    report: 'Report this page',
    reportHref: (shareId: string) =>
      `mailto:hello@lumen.study?subject=${encodeURIComponent(`Reporting a shared page (${shareId})`)}`,
    disclaimer: AI_DISCLAIMER,
    dialogSignedOutTitle: 'Sharing needs an account',
    dialogSignedOutBody:
      'A link has to be readable by someone else, and a signed-out note lives only in this ' +
      'browser. Signing in keeps your notes across devices and makes sharing possible.',
    creating: 'Making a link…',
    copied: 'Link copied.',
    revoked: 'Link turned off. Anyone opening it now sees nothing.',
    failed: 'That did not work',
    failedBody: 'Nothing changed on your note. Trying again usually works.',
    notSynced:
      'This note has not reached your library yet. It syncs on its own in a moment — try again ' +
      'then.',
    expiryNever: 'No expiry',
    expiryDay: 'Expires in a day',
    expiryWeek: 'Expires in a week',
    expiryMonth: 'Expires in a month',
  },

  print: {
    laying: 'Laying it out into pages…',
    ready: 'Laid out. Print this page and choose “Save as PDF”.',
    print: 'Print',
    backToNote: 'Back to the note',
    nothingTitle: 'There is nothing to print yet',
    nothingBody:
      'This note has not been rebuilt into a study guide, so there are no pages to lay out.',
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
      'This is a partial study guide — generation stopped before it finished. Nothing was charged for it.',
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

    unreachableTitle: 'We could not reach the service',

    pausedTitle: 'Rebuilding is paused',
    pausedBody:
      'We have stopped generation for a moment, usually because something is wrong on our side. ' +
      'Your notes are safe on this device. Try again a little later.',
  },

  /**
   * The note workspace (phase-05). Copy voice is 01-PRODUCT.md §6 throughout: what happened, what
   * it costs, and what to do next — never a warning that leaves a student with nothing to press.
   */
  workspace: {
    read: 'Read',
    edit: 'Edit',
    study: 'Study',
    saveToLibrary: 'Save to library',
    saveToLibraryHint: 'Sign in to keep this across your devices.',
    exportCta: 'Export',
    exportUnavailable: 'Export needs the note open on this device.',
    exportLocal: 'Made on this device — nothing is uploaded.',
    exportStarted: (format: string) => `Building your ${FORMAT_NAMES[format] ?? format}…`,
    exportDone: (format: string) => `${FORMAT_NAMES[format] ?? format} downloaded.`,
    exportFailed: 'That export did not finish',
    exportFailedBody:
      'Nothing was lost — your note is exactly as it was. Trying again usually works.',
    shareCta: 'Share',
    shareSoon: 'Sharing arrives in the next build.',
    regenerate: 'Regenerate',
    regenerateSection: 'Regenerate this section',
    history: 'Version history',
    undo: 'Undo',
    saving: 'Saving…',
    saved: 'Saved on this device',
    offlineBanner:
      'You are offline — your changes are saved on this device and will sync when you sign in.',
    meta: (model: string, when: string, mode: string) =>
      `Rebuilt with ${model} · ${when} · ${mode} mode`,
    metaNoModel: (when: string, mode: string) => `${when} · ${mode} mode`,

    acceptAll: 'Accept all',
    keepOnlyMine: 'Keep only mine',
    reviewAi: 'Review each AI change',
    accept: 'Accept',
    reject: 'Reject',
    acceptHint: 'Keep this and mark it as yours.',
    rejectAddedHint: 'Remove this.',
    rejectChangedHint: 'Put your own wording back.',
    reviewProgress: (done: number, total: number) => `${done} of ${total} reviewed`,
    reviewDone: 'Everything is reviewed.',
    nothingToReview: 'Nothing here was written by AI — this note is all yours.',
    originalEmpty:
      'These notes came back almost entirely rebuilt, so there is very little of the original to show.',

    regenTitle: 'Rewrite this section',
    regenBody:
      'We will rewrite this section only. Tell us what to change if you have something in mind.',
    regenPlaceholder: 'e.g. add a worked example with real numbers',
    regenCost: 'Costs a quarter of a credit.',
    regenCostFree: 'Free — you are using your own key.',
    regenRunning: 'Rewriting this section…',
    regenApply: 'Use the new version',
    regenDiscard: 'Keep what I had',
    regenUnchanged: 'The rewrite came back the same. Nothing to change.',
    regenKeptOriginal: 'We kept the section you had.',
    diffAdded: 'New',
    diffRemoved: 'Removed',
    diffKept: 'Unchanged',
    diffSummary: (added: number, removed: number) =>
      `${added} new, ${removed} removed. Read it before you keep it.`,

    askTitle: 'Ask about this',
    askPlaceholder: 'What do you want to know about it?',
    askRunning: 'Thinking…',
    askInsertMargin: 'Add as a margin note',
    askInsertParagraph: 'Add as a paragraph',
    askDismiss: 'Just reading, thanks',
    askSelectFirst: 'Select some text first, then ask about it.',

    insert: 'Insert',
    insertEquation: 'Equation',
    insertStructure: 'Chemical structure',
    insertDiagram: 'Diagram',
    insertWorkedExample: 'Worked example',
    insertCallout: 'Callout',
    insertTable: 'Table',
    insertImage: 'Image',

    editBlock: 'Edit',
    deleteBlock: 'Delete',
    latexLabel: 'LaTeX',
    latexHint: 'Chemistry uses mhchem: \\ce{CO3^2-}.',
    smilesLabel: 'SMILES',
    smilesHint: 'The structure updates as you type.',
    mermaidLabel: 'Mermaid',
    mermaidHint: 'Flowcharts, sequences, timelines and mind maps.',
    previewInvalid: 'That does not parse yet — the preview will appear when it does.',
    saveBlock: 'Save',
    cancel: 'Cancel',

    historyTitle: 'Version history',
    historyEmpty: 'Nothing to go back to yet. We save a version each time this note changes.',
    historyRestore: 'Restore',
    historyCurrent: 'Current',
    historyReason: {
      generated: 'Generated',
      regenerated: 'Section rewritten',
      edit: 'While you were editing',
      restore: 'Before restoring',
    } as Record<string, string>,

    studySoonTitle: 'Flashcards and a quiz, next',
    studySoonBody:
      'Your note already carries the material for them. The study tools themselves land in the ' +
      'next build.',
    studyCounts: (cards: number, questions: number) =>
      `${cards} ${cards === 1 ? 'flashcard' : 'flashcards'} · ${questions} quiz ${questions === 1 ? 'question' : 'questions'} ready`,
  },

  settings: {
    title: 'Settings',
    lead: 'Your account, defaults and data — without taking local notes away.',
    accountHeading: 'Account',
    signedOutLead: 'You are using Lumen locally. Sign in only when you want sync.',
    signedInAs: (email: string) => `Signed in as ${email}`,
    signOut: 'Sign out',
    appearanceHeading: 'Appearance',
    defaultsHeading: 'Default note options',
    defaultsLead: 'These choices are pre-filled when you make your next lesson.',
    dataHeading: 'Your data',
    dataLead: 'Download every lesson as Markdown files in one ZIP.',
    downloadAll: 'Download all notes',
    downloading: 'Preparing your download…',
    deleteHeading: 'Delete everything',
    deleteLead:
      'This removes your account, synced lessons, previews and integrations. It cannot be undone.',
    deleteButton: 'Delete my account and notes',
    deleteTitle: 'Delete everything?',
    deleteBody: (email: string) =>
      `Type ${email} to confirm. Every synced and local lesson will be removed.`,
    confirmEmail: 'Email to confirm',
    deleteConfirm: 'Delete everything',
    deleting: 'Deleting…',
    deleteFailed: 'We could not delete everything. Nothing local was removed — try again.',
    accountDeleted: 'Your account and every local copy have been deleted.',
    prefsSaved: 'Defaults saved.',
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
