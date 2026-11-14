'use client';

import * as React from 'react';
import * as DropdownMenuPrime from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/utils';
import { Highlight, HighlightItem, type HighlightProps, type HighlightItemProps } from '@/components/ui/highlight';
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';

type DropdownMenuProps = DropdownMenuPrimitiveProps;

function DropdownMenu(props: DropdownMenuProps) {
  return <DropdownMenuPrimitive {...props} />;
}

type DropdownMenuTriggerProps = DropdownMenuTriggerPrimitiveProps;

function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  return <DropdownMenuTriggerPrimitive {...props} />;
}

type DropdownMenuContentProps = DropdownMenuContentPrimitiveProps;

function DropdownMenuContent({
  sideOffset = 4,
  className,
  children,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuContentPrimitive
      sideOffset={sideOffset}
      className={cn(
        'bg-popover text-popover-foreground z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-none',
        className,
      )}
      {...props}
    >
      <DropdownMenuHighlightPrimitive className="absolute inset-0 bg-accent z-0 rounded-sm">
        {children}
      </DropdownMenuHighlightPrimitive>
    </DropdownMenuContentPrimitive>
  );
}

type DropdownMenuGroupProps = DropdownMenuGroupPrimitiveProps;

function DropdownMenuGroup({ ...props }: DropdownMenuGroupProps) {
  return <DropdownMenuGroupPrimitive {...props} />;
}

type DropdownMenuItemProps = DropdownMenuItemPrimitiveProps & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
};

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  disabled,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuHighlightItemPrimitive
      activeClassName={
        variant === 'destructive'
          ? 'bg-destructive/10 dark:bg-destructive/20'
          : ''
      }
      disabled={disabled}
    >
      <DropdownMenuItemPrimitive
        disabled={disabled}
        data-inset={inset}
        data-variant={variant}
        className={cn(
          "focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      />
    </DropdownMenuHighlightItemPrimitive>
  );
}

type DropdownMenuCheckboxItemProps = DropdownMenuCheckboxItemPrimitiveProps;

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  disabled,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuHighlightItemPrimitive disabled={disabled}>
      <DropdownMenuCheckboxItemPrimitive
        disabled={disabled}
        className={cn(
          "focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        checked={checked}
        {...props}
      >
        <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
          <DropdownMenuItemIndicatorPrimitive
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <CheckIcon className="size-4" />
          </DropdownMenuItemIndicatorPrimitive>
        </span>
        {children}
      </DropdownMenuCheckboxItemPrimitive>
    </DropdownMenuHighlightItemPrimitive>
  );
}

type DropdownMenuRadioGroupProps = DropdownMenuRadioGroupPrimitiveProps;

function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return <DropdownMenuRadioGroupPrimitive {...props} />;
}

type DropdownMenuRadioItemProps = DropdownMenuRadioItemPrimitiveProps;

function DropdownMenuRadioItem({
  className,
  children,
  disabled,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuHighlightItemPrimitive disabled={disabled}>
      <DropdownMenuRadioItemPrimitive
        disabled={disabled}
        className={cn(
          "focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      >
        <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
          <DropdownMenuItemIndicatorPrimitive layoutId="dropdown-menu-item-indicator-radio">
            <CircleIcon className="size-2 fill-current" />
          </DropdownMenuItemIndicatorPrimitive>
        </span>
        {children}
      </DropdownMenuRadioItemPrimitive>
    </DropdownMenuHighlightItemPrimitive>
  );
}

type DropdownMenuLabelProps = DropdownMenuLabelPrimitiveProps & {
  inset?: boolean;
};

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: DropdownMenuLabelProps) {
  return (
    <DropdownMenuLabelPrimitive
      data-inset={inset}
      className={cn(
        'px-2 py-1.5 text-sm font-medium data-[inset]:pl-8',
        className,
      )}
      {...props}
    />
  );
}

type DropdownMenuSeparatorProps = DropdownMenuSeparatorPrimitiveProps;

function DropdownMenuSeparator({
  className,
  ...props
}: DropdownMenuSeparatorProps) {
  return (
    <DropdownMenuSeparatorPrimitive
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

type DropdownMenuShortcutProps = DropdownMenuShortcutPrimitiveProps;

function DropdownMenuShortcut({
  className,
  ...props
}: DropdownMenuShortcutProps) {
  return (
    <DropdownMenuShortcutPrimitive
      className={cn(
        'text-muted-foreground ml-auto text-xs tracking-widest',
        className,
      )}
      {...props}
    />
  );
}

type DropdownMenuSubProps = DropdownMenuSubPrimitiveProps;

function DropdownMenuSub(props: DropdownMenuSubProps) {
  return <DropdownMenuSubPrimitive {...props} />;
}

type DropdownMenuSubTriggerProps = DropdownMenuSubTriggerPrimitiveProps & {
  inset?: boolean;
};

function DropdownMenuSubTrigger({
  disabled,
  className,
  inset,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <DropdownMenuHighlightItemPrimitive disabled={disabled}>
      <DropdownMenuSubTriggerPrimitive
        disabled={disabled}
        data-inset={inset}
        className={cn(
          'focus:text-accent-foreground data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8',
          'data-[state=open]:[&_[data-slot=chevron]]:rotate-90 [&_[data-slot=chevron]]:transition-transform [&_[data-slot=chevron]]:duration-300 [&_[data-slot=chevron]]:ease-in-out',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronRightIcon data-slot="chevron" className="ml-auto size-4" />
      </DropdownMenuSubTriggerPrimitive>
    </DropdownMenuHighlightItemPrimitive>
  );
}

type DropdownMenuSubContentProps = DropdownMenuSubContentPrimitiveProps;

function DropdownMenuSubContent({
  className,
  ...props
}: DropdownMenuSubContentProps) {
  return (
    <DropdownMenuSubContentPrimitive
      className={cn(
        'bg-popover text-popover-foreground z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg outline-none',
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  type DropdownMenuProps,
  type DropdownMenuTriggerProps,
  type DropdownMenuContentProps,
  type DropdownMenuGroupProps,
  type DropdownMenuItemProps,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuRadioGroupProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuLabelProps,
  type DropdownMenuSeparatorProps,
  type DropdownMenuShortcutProps,
  type DropdownMenuSubProps,
  type DropdownMenuSubTriggerProps,
  type DropdownMenuSubContentProps,
};





type DropdownMenuContextType = {
  isOpen: boolean;
  setIsOpen: (o: boolean) => void;
  highlightedValue: string | null;
  setHighlightedValue: (value: string | null) => void;
};

type DropdownMenuSubContextType = {
  isOpen: boolean;
  setIsOpen: (o: boolean) => void;
};

const [DropdownMenuProvider, useDropdownMenu] =
  getStrictContext<DropdownMenuContextType>('DropdownMenuContext');

const [DropdownMenuSubProvider, useDropdownMenuSub] =
  getStrictContext<DropdownMenuSubContextType>('DropdownMenuSubContext');

type DropdownMenuPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.Root
>;

function DropdownMenuPrimitive(props: DropdownMenuPrimitiveProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });
  const [highlightedValue, setHighlightedValue] = React.useState<string | null>(
    null,
  );

  return (
    <DropdownMenuProvider
      value={{ isOpen, setIsOpen, highlightedValue, setHighlightedValue }}
    >
      <DropdownMenuPrime.Root
        data-slot="dropdown-menu"
        {...props}
        onOpenChange={setIsOpen}
      />
    </DropdownMenuProvider>
  );
}

type DropdownMenuTriggerPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.Trigger
>;

function DropdownMenuTriggerPrimitive(props: DropdownMenuTriggerPrimitiveProps) {
  return (
    <DropdownMenuPrime.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

type DropdownMenuPortalPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.Portal
>;

function DropdownMenuPortalPrimitive(props: DropdownMenuPortalPrimitiveProps) {
  return (
    <DropdownMenuPrime.Portal data-slot="dropdown-menu-portal" {...props} />
  );
}

type DropdownMenuGroupPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.Group
>;

function DropdownMenuGroupPrimitive(props: DropdownMenuGroupPrimitiveProps) {
  return (
    <DropdownMenuPrime.Group data-slot="dropdown-menu-group" {...props} />
  );
}

type DropdownMenuSubPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.Sub
>;

function DropdownMenuSubPrimitive(props: DropdownMenuSubPrimitiveProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });

  return (
    <DropdownMenuSubProvider value={{ isOpen, setIsOpen }}>
      <DropdownMenuPrime.Sub
        data-slot="dropdown-menu-sub"
        {...props}
        onOpenChange={setIsOpen}
      />
    </DropdownMenuSubProvider>
  );
}

type DropdownMenuRadioGroupPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.RadioGroup
>;

function DropdownMenuRadioGroupPrimitive(props: DropdownMenuRadioGroupPrimitiveProps) {
  return (
    <DropdownMenuPrime.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

type DropdownMenuSubTriggerPrimitiveProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrime.SubTrigger>,
  'asChild'
> &
  HTMLMotionProps<'div'>;

function DropdownMenuSubTriggerPrimitive({
  disabled,
  textValue,
  ...props
}: DropdownMenuSubTriggerPrimitiveProps) {
  const { setHighlightedValue } = useDropdownMenu();
  const [, highlightedRef] = useDataState<HTMLDivElement>(
    'highlighted',
    undefined,
    (value) => {
      if (value === true) {
        const el = highlightedRef.current;
        const v = el?.dataset.value || el?.id || null;
        if (v) setHighlightedValue(v);
      }
    },
  );

  return (
    <DropdownMenuPrime.SubTrigger
      ref={highlightedRef}
      disabled={disabled}
      textValue={textValue}
      asChild
    >
      <motion.div
        data-slot="dropdown-menu-sub-trigger"
        data-disabled={disabled}
        {...props}
      />
    </DropdownMenuPrime.SubTrigger>
  );
}

type DropdownMenuSubContentPrimitiveProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrime.SubContent>,
  'forceMount' | 'asChild'
> &
  Omit<
    React.ComponentProps<typeof DropdownMenuPrime.Portal>,
    'forceMount'
  > &
  HTMLMotionProps<'div'>;

function DropdownMenuSubContentPrimitive({
  loop,
  onEscapeKeyDown,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  sideOffset,
  alignOffset,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  arrowPadding,
  sticky,
  hideWhenDetached,
  transition = { duration: 0.2 },
  style,
  container,
  ...props
}: DropdownMenuSubContentPrimitiveProps) {
  const { isOpen } = useDropdownMenuSub();

  return (
    <AnimatePresence>
      {isOpen && (
        <DropdownMenuPortalPrimitive forceMount container={container}>
          <DropdownMenuPrime.SubContent
            asChild
            forceMount
            loop={loop}
            onEscapeKeyDown={onEscapeKeyDown}
            onPointerDownOutside={onPointerDownOutside}
            onFocusOutside={onFocusOutside}
            onInteractOutside={onInteractOutside}
            sideOffset={sideOffset}
            alignOffset={alignOffset}
            avoidCollisions={avoidCollisions}
            collisionBoundary={collisionBoundary}
            collisionPadding={collisionPadding}
            arrowPadding={arrowPadding}
            sticky={sticky}
            hideWhenDetached={hideWhenDetached}
          >
            <motion.div
              key="dropdown-menu-sub-content"
              data-slot="dropdown-menu-sub-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={transition}
              style={{ willChange: 'opacity, transform', ...style }}
              {...props}
            />
          </DropdownMenuPrime.SubContent>
        </DropdownMenuPortalPrimitive>
      )}
    </AnimatePresence>
  );
}

type DropdownMenuHighlightProps = Omit<
  HighlightProps,
  'controlledItems' | 'enabled' | 'hover'
> & {
  animateOnHover?: boolean;
};

// A menu is a single column, so the wash behind the rows should only ever travel up and down. Its horizontal axis needs no
// animating at all: `inset-0` on the row it lives in has already sized and placed it. Motion still projects a horizontal delta,
// because it measures the rows through the content's own opening animation -- a 0.95 scale about the Radix transform origin,
// which is a corner rather than the centre Motion assumes -- and that mismeasurement is what sends the wash sliding in from the
// side of the menu and stretching out to width instead of sliding between the rows. Pinning the X translate to zero and the X
// scale to one drops that component on the floor and leaves the vertical travel, which is the whole animation, untouched.
const slideVerticallyOnly = (_: unknown, generated: string) =>
  generated.replace(/translate3d\([^,]+,/, 'translate3d(0px,').replace(/scale\([^,)]+,/g, 'scale(1,');

function DropdownMenuHighlightPrimitive({
  transition = { type: 'spring', stiffness: 350, damping: 35 },
  ...props
}: DropdownMenuHighlightProps) {
  const { highlightedValue } = useDropdownMenu();

  return (
    <Highlight
      data-slot="dropdown-menu-highlight"
      click={false}
      controlledItems
      transition={transition}
      value={highlightedValue}
      transformTemplate={slideVerticallyOnly}
      {...props}
    />
  );
}

type DropdownMenuContentPrimitiveProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrime.Content>,
  'forceMount' | 'asChild'
> &
  Omit<
    React.ComponentProps<typeof DropdownMenuPrime.Portal>,
    'forceMount'
  > &
  HTMLMotionProps<'div'>;

function DropdownMenuContentPrimitive({
  loop,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  side,
  sideOffset,
  align,
  alignOffset,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  arrowPadding,
  sticky,
  hideWhenDetached,
  transition = { duration: 0.2 },
  style,
  container,
  ...props
}: DropdownMenuContentProps) {
  const { isOpen } = useDropdownMenu();

  return (
    <AnimatePresence>
      {isOpen && (
        <DropdownMenuPortalPrimitive forceMount container={container}>
          <DropdownMenuPrime.Content
            asChild
            loop={loop}
            onCloseAutoFocus={onCloseAutoFocus}
            onEscapeKeyDown={onEscapeKeyDown}
            onPointerDownOutside={onPointerDownOutside}
            onFocusOutside={onFocusOutside}
            onInteractOutside={onInteractOutside}
            side={side}
            sideOffset={sideOffset}
            align={align}
            alignOffset={alignOffset}
            avoidCollisions={avoidCollisions}
            collisionBoundary={collisionBoundary}
            collisionPadding={collisionPadding}
            arrowPadding={arrowPadding}
            sticky={sticky}
            hideWhenDetached={hideWhenDetached}
          >
            <motion.div
              key="dropdown-menu-content"
              data-slot="dropdown-menu-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={transition}
              style={{ willChange: 'opacity, transform', ...style }}
              {...props}
            />
          </DropdownMenuPrime.Content>
        </DropdownMenuPortalPrimitive>
      )}
    </AnimatePresence>
  );
}

type DropdownMenuHighlightItemProps = HighlightItemProps;

function DropdownMenuHighlightItemPrimitive(props: DropdownMenuHighlightItemProps) {
  return <HighlightItem data-slot="dropdown-menu-highlight-item" {...props} />;
}

type DropdownMenuItemPrimitiveProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrime.Item>,
  'asChild'
> &
  HTMLMotionProps<'div'>;

function DropdownMenuItemPrimitive({
  disabled,
  onSelect,
  textValue,
  ...props
}: DropdownMenuItemPrimitiveProps) {
  const { setHighlightedValue } = useDropdownMenu();
  const [, highlightedRef] = useDataState<HTMLDivElement>(
    'highlighted',
    undefined,
    (value) => {
      if (value === true) {
        const el = highlightedRef.current;
        const v = el?.dataset.value || el?.id || null;
        if (v) setHighlightedValue(v);
      }
    },
  );

  return (
    <DropdownMenuPrime.Item
      ref={highlightedRef}
      disabled={disabled}
      onSelect={onSelect}
      textValue={textValue}
      asChild
    >
      <motion.div
        data-slot="dropdown-menu-item"
        data-disabled={disabled}
        {...props}
      />
    </DropdownMenuPrime.Item>
  );
}

type DropdownMenuCheckboxItemPrimitiveProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrime.CheckboxItem>,
  'asChild'
> &
  HTMLMotionProps<'div'>;

function DropdownMenuCheckboxItemPrimitive({
  checked,
  onCheckedChange,
  disabled,
  onSelect,
  textValue,
  ...props
}: DropdownMenuCheckboxItemPrimitiveProps) {
  const { setHighlightedValue } = useDropdownMenu();
  const [, highlightedRef] = useDataState<HTMLDivElement>(
    'highlighted',
    undefined,
    (value) => {
      if (value === true) {
        const el = highlightedRef.current;
        const v = el?.dataset.value || el?.id || null;
        if (v) setHighlightedValue(v);
      }
    },
  );

  return (
    <DropdownMenuPrime.CheckboxItem
      ref={highlightedRef}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      onSelect={onSelect}
      textValue={textValue}
      asChild
    >
      <motion.div
        data-slot="dropdown-menu-checkbox-item"
        data-disabled={disabled}
        {...props}
      />
    </DropdownMenuPrime.CheckboxItem>
  );
}

type DropdownMenuRadioItemPrimitiveProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrime.RadioItem>,
  'asChild'
> &
  HTMLMotionProps<'div'>;

function DropdownMenuRadioItemPrimitive({
  value,
  disabled,
  onSelect,
  textValue,
  ...props
}: DropdownMenuRadioItemPrimitiveProps) {
  const { setHighlightedValue } = useDropdownMenu();
  const [, highlightedRef] = useDataState<HTMLDivElement>(
    'highlighted',
    undefined,
    (value) => {
      if (value === true) {
        const el = highlightedRef.current;
        const v = el?.dataset.value || el?.id || null;
        if (v) setHighlightedValue(v);
      }
    },
  );

  return (
    <DropdownMenuPrime.RadioItem
      ref={highlightedRef}
      value={value}
      disabled={disabled}
      onSelect={onSelect}
      textValue={textValue}
      asChild
    >
      <motion.div
        data-slot="dropdown-menu-radio-item"
        data-disabled={disabled}
        {...props}
      />
    </DropdownMenuPrime.RadioItem>
  );
}

type DropdownMenuLabelPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.Label
>;

function DropdownMenuLabelPrimitive(props: DropdownMenuLabelPrimitiveProps) {
  return (
    <DropdownMenuPrime.Label data-slot="dropdown-menu-label" {...props} />
  );
}

type DropdownMenuSeparatorPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrime.Separator
>;

function DropdownMenuSeparatorPrimitive(props: DropdownMenuSeparatorPrimitiveProps) {
  return (
    <DropdownMenuPrime.Separator
      data-slot="dropdown-menu-separator"
      {...props}
    />
  );
}

type DropdownMenuShortcutPrimitiveProps = React.ComponentProps<'span'>;

function DropdownMenuShortcutPrimitive(props: DropdownMenuShortcutPrimitiveProps) {
  return <span data-slot="dropdown-menu-shortcut" {...props} />;
}

type DropdownMenuItemIndicatorPrimitiveProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrime.ItemIndicator>,
  'asChild'
> &
  HTMLMotionProps<'div'>;

function DropdownMenuItemIndicatorPrimitive(props: DropdownMenuItemIndicatorPrimitiveProps) {
  return (
    <DropdownMenuPrime.ItemIndicator
      data-slot="dropdown-menu-item-indicator"
      asChild
    >
      <motion.div {...props} />
    </DropdownMenuPrime.ItemIndicator>
  );
}



function getStrictContext<T>(
  name?: string,
): readonly [
  ({
    value,
    children,
  }: {
    value: T;
    children?: React.ReactNode;
  }) => React.JSX.Element,
  () => T,
] {
  const Context = React.createContext<T | undefined>(undefined);

  const Provider = ({
    value,
    children,
  }: {
    value: T;
    children?: React.ReactNode;
  }) => <Context.Provider value={value}>{children}</Context.Provider>;

  const useSafeContext = () => {
    const ctx = React.useContext(Context);
    if (ctx === undefined) {
      throw new Error(`useContext must be used within ${name ?? 'a Provider'}`);
    }
    return ctx;
  };

  return [Provider, useSafeContext] as const;
}

export { getStrictContext };


interface CommonControlledStateProps<T> {
  value?: T;
  defaultValue?: T;
}

export function useControlledState<T, Rest extends any[] = []>(
  props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
  },
): readonly [T, (next: T, ...args: Rest) => void] {
  const { value, defaultValue, onChange } = props;

  const [state, setInternalState] = React.useState<T>(
    value !== undefined ? value : (defaultValue as T),
  );

  React.useEffect(() => {
    if (value !== undefined) setInternalState(value);
  }, [value]);

  const setState = React.useCallback(
    (next: T, ...args: Rest) => {
      setInternalState(next);
      onChange?.(next, ...args);
    },
    [onChange],
  );

  return [state, setState] as const;
}


type DataStateValue = string | boolean | null;

function parseDatasetValue(value: string | null): DataStateValue {
  if (value === null) return null;
  if (value === '' || value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function useDataState<T extends HTMLElement = HTMLElement>(
  key: string,
  forwardedRef?: React.Ref<T | null>,
  onChange?: (value: DataStateValue) => void,
): [DataStateValue, React.RefObject<T | null>] {
  const localRef = React.useRef<T | null>(null);
  React.useImperativeHandle(forwardedRef, () => localRef.current as T);

  const getSnapshot = (): DataStateValue => {
    const el = localRef.current;
    return el ? parseDatasetValue(el.getAttribute(`data-${key}`)) : null;
  };

  const subscribe = (callback: () => void) => {
    const el = localRef.current;
    if (!el) return () => {};
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === `data-${key}`) {
          callback();
          break;
        }
      }
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: [`data-${key}`],
    });
    return () => observer.disconnect();
  };

  const value = React.useSyncExternalStore(subscribe, getSnapshot);

  React.useEffect(() => {
    if (onChange) onChange(value);
  }, [value, onChange]);

  return [value, localRef];
}

export { useDataState, type DataStateValue };


