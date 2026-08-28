/**
 * The primitive layer (03-DESIGN.md §5). Import from here, not from the individual files —
 * `optimizePackageImports` in next.config.ts keeps the barrel from costing anything.
 */
export { Avatar } from './avatar';
export { Badge } from './badge';
export type { BadgeTone } from './badge';
export { Button } from './button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './button';
export { Card } from './card';
export { Checkbox } from './checkbox';
export { Chip } from './chip';
export { Combobox } from './combobox';
export type { ComboboxOption } from './combobox';
export { CommandMenu, useCommandMenuShortcut } from './command-menu';
export type { CommandItem } from './command-menu';
export { Dialog, DialogClose, DialogContent, DialogTrigger } from './dialog';
export { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from './drawer';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
export { EmptyState } from './empty-state';
export { Field, useFieldControl } from './field';
export { IconButton } from './icon-button';
export * from './icons';
export { Input } from './input';
export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger } from './popover';
export { Progress } from './progress';
export { Radio, RadioGroup } from './radio-group';
export { ScrollArea } from './scroll-area';
export { Select, SelectGroup, SelectItem, SelectLabel, SelectSeparator } from './select';
export { Separator } from './separator';
export { Skeleton, SkeletonParagraph } from './skeleton';
export { Slider } from './slider';
export { Spinner } from './spinner';
export { Switch } from './switch';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
export { Textarea } from './textarea';
export { ToastProvider, useToast } from './toast';
export type { ToastOptions, ToastTone } from './toast';
export { Tooltip, TooltipProvider } from './tooltip';
