import { cn } from '@/lib/utils/cn';
import type { ParagraphBlock } from '@/lib/ai/schema';

import { ProvenanceSpan } from '../provenance-mark';
import { renderInline } from '../markdown/inline';

/**
 * Prose. When the model supplies `spans`, the paragraph is assembled from them so that a single
 * clarified phrase can be marked *inside* a sentence the student wrote — which is the honest
 * granularity for "we sharpened your wording" and much less intrusive than flagging the whole
 * paragraph as ours.
 */
export function Paragraph({ block, className }: { block: ParagraphBlock; className?: string }) {
  return (
    <p className={cn('my-4 leading-note', className)}>
      {block.spans?.length
        ? block.spans.map((span, index) => (
            <ProvenanceSpan
              key={index}
              origin={span.origin ?? 'student'}
              originalText={span.originalText}
            >
              {renderInline(span.text, `span-${index}`)}
            </ProvenanceSpan>
          ))
        : renderInline(block.text, 'p')}
    </p>
  );
}
