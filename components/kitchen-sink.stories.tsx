import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider, useToast } from '@/components/ui/toast';

import { Avatar } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Chip } from './ui/chip';
import { Combobox } from './ui/combobox';
import { CommandMenu } from './ui/command-menu';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './ui/dialog';
import { Drawer, DrawerContent, DrawerTrigger } from './ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { EmptyState } from './ui/empty-state';
import { Field } from './ui/field';
import { IconButton } from './ui/icon-button';
import {
  BookIcon,
  ChevronDownIcon,
  DownloadIcon,
  SearchIcon,
  SparkIcon,
  TrashIcon,
  UploadIcon,
} from './ui/icons';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Progress } from './ui/progress';
import { Radio, RadioGroup } from './ui/radio-group';
import { ScrollArea } from './ui/scroll-area';
import { SegmentedControl } from './ui/segmented-control';
import { Select, SelectItem } from './ui/select';
import { Separator } from './ui/separator';
import { Skeleton, SkeletonParagraph } from './ui/skeleton';
import { Slider } from './ui/slider';
import { Spinner } from './ui/spinner';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Tooltip } from './ui/tooltip';

/**
 * Every primitive on one page.
 *
 * Not a substitute for the individual stories — it exists for the two things that only show up
 * when components sit next to each other: whether the type scale, the radii and the border
 * weights agree across the set, and whether a theme flip leaves anything behind.
 */
const meta: Meta = {
  title: 'Kitchen Sink',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <ToastProvider>
          <div className="min-h-dvh bg-bg p-8">
            <Story />
          </div>
        </ToastProvider>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

export const Everything: Story = {
  render: function Everything() {
    const toast = useToast();
    const [commandOpen, setCommandOpen] = useState(false);
    const [mode, setMode] = useState('complete');
    const [course, setCourse] = useState<string | null>('ap-chem');

    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <header>
          <h1 className="font-serif text-3xl font-semibold text-text">Kitchen sink</h1>
          <p className="mt-1 font-sans text-text-muted">
            Every primitive, one page. Flip the theme in the toolbar.
          </p>
        </header>

        <Group title="Buttons">
          <Button variant="primary" icon={<SparkIcon />}>
            Create study guide
          </Button>
          <Button>Export</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger" icon={<TrashIcon />}>
            Delete
          </Button>
          <Button loading>Rebuilding</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="Search" icon={<SearchIcon />} variant="secondary" />
          <Spinner label="Loading" />
        </Group>

        <Group title="Status">
          <Badge>Unit 1</Badge>
          <Badge tone="accent">AP Chemistry pack</Badge>
          <Badge tone="success">Checked</Badge>
          <Badge tone="warning">Double-check</Badge>
          <Badge tone="danger">Quota reached</Badge>
          <Badge tone="ai" icon={<SparkIcon />}>
            added
          </Badge>
          <Chip icon={<BookIcon />} onRemove={() => {}} removeLabel="Remove notes.docx">
            notes.docx
          </Chip>
          <Avatar name="Marvin Wang" />
        </Group>

        <Group title="Progress">
          <div className="w-64">
            <Progress value={62} label="Reading notes" />
          </div>
          <div className="w-64">
            <Progress label="Rebuilding" variant="hairline" />
          </div>
          <div className="w-48">
            <SkeletonParagraph />
          </div>
          <Skeleton className="h-16 w-32" />
        </Group>

        <Group title="Form">
          <div className="w-64">
            <Field label="Course" hint="However your school writes it.">
              <Input placeholder="AP Chemistry" icon={<SearchIcon />} />
            </Field>
          </div>
          <div className="w-64">
            <Field label="Curriculum">
              <Select defaultValue="AP" aria-label="Curriculum">
                <SelectItem value="AP">AP</SelectItem>
                <SelectItem value="IB_HL">IB Higher Level</SelectItem>
              </Select>
            </Field>
          </div>
          <div className="w-64">
            <Field label="Course" labelHidden>
              <Combobox
                value={course}
                onValueChange={setCourse}
                aria-label="Course"
                options={[
                  { value: 'ap-chem', label: 'AP Chemistry', detail: 'College Board' },
                  { value: 'ib-chem', label: 'Chemistry HL', detail: 'IB Diploma' },
                ]}
              />
            </Field>
          </div>
          <div className="w-64">
            <Field label="Anything else we should know?">
              <Textarea rows={3} placeholder="Optional" />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            <Checkbox defaultChecked label="Include flashcards" />
            <Switch defaultChecked label="Highlight AI" />
            <RadioGroup defaultValue="local" aria-label="Where to save">
              <Radio value="local" label="This browser" />
              <Radio value="account" label="My account" />
            </RadioGroup>
          </div>
          <div className="w-56">
            <Field label="Daily budget">
              <Slider defaultValue={[3]} min={1} max={10} thumbLabels={['Daily budget']} />
            </Field>
          </div>
          <SegmentedControl
            label="How much should we do?"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'tidy', label: 'Tidy up' },
              { value: 'complete', label: 'Complete it' },
              { value: 'study_guide', label: 'Study guide' },
            ]}
          />
        </Group>

        <Group title="Overlays">
          <Tooltip content="Rebuilt with DeepSeek V4">
            <Button>Tooltip</Button>
          </Tooltip>
          <Popover>
            <PopoverTrigger asChild>
              <Button>Popover</Button>
            </PopoverTrigger>
            <PopoverContent label="About the estimate">
              <p className="text-sm text-text-muted">About ¥0.06 for this note.</p>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button trailing={<ChevronDownIcon />}>Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={<DownloadIcon />}>Export</DropdownMenuItem>
              <DropdownMenuItem danger icon={<TrashIcon />}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Dialog</Button>
            </DialogTrigger>
            <DialogContent
              size="sm"
              title="Delete this note?"
              description="It only lives in this browser, so there will be no copy left."
              footer={
                <DialogClose asChild>
                  <Button variant="danger">Delete</Button>
                </DialogClose>
              }
            >
              <p className="text-text-muted">This cannot be undone.</p>
            </DialogContent>
          </Dialog>
          <Drawer>
            <DrawerTrigger asChild>
              <Button>Drawer</Button>
            </DrawerTrigger>
            <DrawerContent title="Export" description="Pick a format.">
              <p className="text-text-muted">Everything is made in your browser.</p>
            </DrawerContent>
          </Drawer>
          <Button onClick={() => toast({ title: 'Saved to your library', tone: 'success' })}>
            Toast
          </Button>
          <Button onClick={() => setCommandOpen(true)} trailing="⌘K">
            Command menu
          </Button>
          <CommandMenu
            open={commandOpen}
            onOpenChange={setCommandOpen}
            items={[
              {
                id: 'new',
                label: 'New study guide',
                group: 'Actions',
                icon: <UploadIcon />,
                onSelect: () => {},
              },
              {
                id: 'note',
                label: 'AP Chemistry · Unit 1',
                group: 'Your notes',
                icon: <BookIcon />,
                onSelect: () => {},
              },
            ]}
          />
        </Group>

        <Group title="Containers">
          <Card className="w-64">
            <p className="text-sm text-text">A card.</p>
            <p className="mt-1 text-sm text-text-muted">Hairline border, no shadow at rest.</p>
          </Card>
          <Card surface="sunken" className="w-64">
            <p className="text-sm text-text-muted">A sunken panel.</p>
          </Card>
          <ScrollArea label="A long list" className="h-32 w-48 rounded-md border border-border">
            <ul className="flex flex-col gap-2 p-3 font-sans text-sm text-text-muted">
              {['Mole', 'Isotope', 'Molar mass', 'Formula unit', 'Mixture', 'Lattice'].map(
                (term) => (
                  <li key={term}>{term}</li>
                ),
              )}
            </ul>
          </ScrollArea>
          <div className="w-64">
            <Tabs defaultValue="note">
              <TabsList>
                <TabsTrigger value="note">Note</TabsTrigger>
                <TabsTrigger value="cards">Flashcards</TabsTrigger>
              </TabsList>
              <TabsContent value="note" className="font-sans text-sm text-text-muted">
                The finished study guide.
              </TabsContent>
              <TabsContent value="cards" className="font-sans text-sm text-text-muted">
                14 cards.
              </TabsContent>
            </Tabs>
          </div>
        </Group>

        <Separator />

        <EmptyState
          icon={<BookIcon />}
          title="Nothing here yet"
          description="Upload the notes you already have."
          action={
            <Button variant="primary" icon={<UploadIcon />}>
              Add notes
            </Button>
          }
        />
      </div>
    );
  },
};
