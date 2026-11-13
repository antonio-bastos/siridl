"use client"

import * as React from 'react';

import { motion, type Transition, type HTMLMotionProps, isMotionComponent } from 'motion/react';
import { cn } from '@/lib/utils';
import { Highlight, HighlightItem, type HighlightProps, type HighlightItemProps } from '@/components/ui/highlight';

type TabsProps = TabsPrimitiveProps;

function Tabs({ className, ...props }: TabsProps) {
  return (
    <TabsPrimitive
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

type TabsListProps = TabsListPrimitiveProps & {
  /**
   * Classes for the pill that slides behind the active trigger. It is a sibling
   * of the list, not a child, so `className` cannot reach it — a list given a
   * surface of its own has to restyle the pill through this, or the two end up
   * the same colour and the active tab vanishes into its own strip.
   */
  highlightClassName?: string;
};

function TabsList({ className, highlightClassName, ...props }: TabsListProps) {
  return (
    <TabsHighlightPrimitive
      className={cn(
        'absolute z-0 inset-0 border border-transparent rounded-md bg-background dark:border-input dark:bg-input/30 shadow-sm',
        highlightClassName,
      )}
    >
      <TabsListPrimitive
        className={cn(
          'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-md p-[3px]',
          className,
        )}
        {...props}
      />
    </TabsHighlightPrimitive>
  );
}

type TabsTriggerProps = TabsTriggerPrimitiveProps;

function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsHighlightItemPrimitive value={props.value} className="flex-1">
      <TabsTriggerPrimitive
        className={cn(
          "data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md w-full px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-500 ease-in-out focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      />
    </TabsHighlightItemPrimitive>
  );
}

type TabsContentsProps = TabsContentsPrimitiveProps;

function TabsContents(props: TabsContentsProps) {
  return <TabsContentsPrimitive {...props} />;
}

type TabsContentProps = TabsContentPrimitiveProps;

function TabsContent({ className, ...props }: TabsContentProps) {
  return (
    <TabsContentPrimitive
      className={cn('outline-none', className)}
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContents,
  TabsContent,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentsProps,
  type TabsContentProps,
};

type TabsContextType = {
  activeValue: string;
  handleValueChange: (value: string) => void;
  registerTrigger: (value: string, node: HTMLElement | null) => void;
};

const [TabsProvider, useTabs] =
  getStrictContext<TabsContextType>('TabsContext');

type BaseTabsProps = React.ComponentProps<'div'> & {
  children: React.ReactNode;
};

type UnControlledTabsProps = BaseTabsProps & {
  defaultValue?: string;
  value?: never;
  onValueChange?: never;
};

type ControlledTabsProps = BaseTabsProps & {
  value: string;
  onValueChange?: (value: string) => void;
  defaultValue?: never;
};

type TabsPrimitiveProps = UnControlledTabsProps | ControlledTabsProps;

function TabsPrimitive({
  defaultValue,
  value,
  onValueChange,
  children,
  ...props
}: TabsPrimitiveProps) {
  const [activeValue, setActiveValue] = React.useState<string | undefined>(
    defaultValue,
  );
  const triggersRef = React.useRef(new Map<string, HTMLElement>());
  const initialSet = React.useRef(false);
  const isControlled = value !== undefined;

  React.useEffect(() => {
    if (
      !isControlled &&
      activeValue === undefined &&
      triggersRef.current.size > 0 &&
      !initialSet.current
    ) {
      const firstTab = triggersRef.current.keys().next().value as
        | string
        | undefined;
      if (firstTab !== undefined) {
        setActiveValue(firstTab);
        initialSet.current = true;
      }
    }
  }, [activeValue, isControlled]);

  const registerTrigger = React.useCallback(
    (val: string, node: HTMLElement | null) => {
      if (node) {
        triggersRef.current.set(val, node);
        if (!isControlled && activeValue === undefined && !initialSet.current) {
          setActiveValue(val);
          initialSet.current = true;
        }
      } else {
        triggersRef.current.delete(val);
      }
    },
    [activeValue, isControlled],
  );

  const handleValueChange = React.useCallback(
    (val: string) => {
      if (!isControlled) setActiveValue(val);
      else onValueChange?.(val);
    },
    [isControlled, onValueChange],
  );

  return (
    <TabsProvider
      value={{
        activeValue: (value ?? activeValue) as string,
        handleValueChange,
        registerTrigger,
      }}
    >
      <div data-slot="tabs" {...props}>
        {children}
      </div>
    </TabsProvider>
  );
}

type TabsHighlightPrimitiveProps = Omit<HighlightProps, 'controlledItems' | 'value'>;

// The tab bar is a horizontal row, so the highlight should only ever travel
// sideways. Motion's layout projection also animates the vertical delta, which
// showed up whenever the list itself moved between renders -- switching to the
// taller "New person" pane re-centres the dialog, and the highlight swooped 70px
// up to catch it. Zeroing the Y translate in the projection transform leaves the
// highlight at its final vertical position from frame one; X still animates.
const slideSidewaysOnly = (_: unknown, generated: string) =>
  generated.replace(/translate3d\(([^,]+),[^,]+,/, 'translate3d($1, 0px,');

function TabsHighlightPrimitive({
  transition = { type: 'spring', stiffness: 200, damping: 25 },
  ...props
}: TabsHighlightPrimitiveProps) {
  const { activeValue } = useTabs();

  return (
    <Highlight
      data-slot="tabs-highlight"
      controlledItems
      value={activeValue}
      transition={transition}
      click={false}
      transformTemplate={slideSidewaysOnly}
      {...props}
    />
  );
}

type TabsListPrimitiveProps = React.ComponentProps<'div'> & {
  children: React.ReactNode;
};

function TabsListPrimitive(props: TabsListPrimitiveProps) {
  return <div role="tablist" data-slot="tabs-list" {...props} />;
}

type TabsHighlightItemProps = HighlightItemProps & {
  value: string;
};

function TabsHighlightItemPrimitive(props: TabsHighlightItemProps) {
  return <HighlightItem data-slot="tabs-highlight-item" {...props} />;
}

type TabsTriggerPrimitiveProps = WithAsChild<
  {
    value: string;
    children: React.ReactNode;
  } & HTMLMotionProps<'button'>
>;

function TabsTriggerPrimitive({
  ref,
  value,
  asChild = false,
  ...props
}: TabsTriggerPrimitiveProps) {
  const { activeValue, handleValueChange, registerTrigger } = useTabs();

  const localRef = React.useRef<HTMLButtonElement | null>(null);
  React.useImperativeHandle(ref, () => localRef.current as HTMLButtonElement);

  React.useEffect(() => {
    registerTrigger(value, localRef.current);
    return () => registerTrigger(value, null);
  }, [value, registerTrigger]);

  const Component = asChild ? Slot : motion.button;

  return (
    <Component
      ref={localRef}
      data-slot="tabs-trigger"
      data-value={value}
      role="tab"
      onClick={() => handleValueChange(value)}
      data-state={activeValue === value ? 'active' : 'inactive'}
      {...props}
    />
  );
}

type TabsContentsPrimitiveProps = HTMLMotionProps<'div'> & {
  children: React.ReactNode;
  transition?: Transition;
};

function TabsContentsPrimitive({
  children,
  transition = {
    type: 'spring',
    stiffness: 300,
    damping: 30,
    bounce: 0,
    restDelta: 0.01,
  },
  ...props
}: TabsContentsPrimitiveProps) {
  const { activeValue } = useTabs();
  const childrenArray = React.Children.toArray(children);
  const activeIndex = childrenArray.findIndex(
    (child): child is React.ReactElement<{ value: string }> =>
      React.isValidElement(child) &&
      typeof child.props === 'object' &&
      child.props !== null &&
      'value' in child.props &&
      child.props.value === activeValue,
  );

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [height, setHeight] = React.useState(0);
  const roRef = React.useRef<ResizeObserver | null>(null);

  const measure = React.useCallback((index: number) => {
    const pane = itemRefs.current[index];
    const container = containerRef.current;
    if (!pane || !container) return 0;

    const base = pane.getBoundingClientRect().height || 0;

    const cs = getComputedStyle(container);
    const isBorderBox = cs.boxSizing === 'border-box';
    const paddingY =
      (parseFloat(cs.paddingTop || '0') || 0) +
      (parseFloat(cs.paddingBottom || '0') || 0);
    const borderY =
      (parseFloat(cs.borderTopWidth || '0') || 0) +
      (parseFloat(cs.borderBottomWidth || '0') || 0);

    let total = base + (isBorderBox ? paddingY + borderY : 0);

    const dpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    total = Math.ceil(total * dpr) / dpr;

    return total;
  }, []);

  React.useEffect(() => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }

    const pane = itemRefs.current[activeIndex];
    const container = containerRef.current;
    if (!pane || !container) return;

    setHeight(measure(activeIndex));

    const ro = new ResizeObserver(() => {
      const next = measure(activeIndex);
      requestAnimationFrame(() => setHeight(next));
    });

    ro.observe(pane);
    ro.observe(container);

    roRef.current = ro;
    return () => {
      ro.disconnect();
      roRef.current = null;
    };
  }, [activeIndex, childrenArray.length, measure]);

  React.useLayoutEffect(() => {
    if (height === 0 && activeIndex >= 0) {
      const next = measure(activeIndex);
      if (next !== 0) setHeight(next);
    }
  }, [activeIndex, height, measure]);

  return (
    // `clip`, not `hidden`: a hidden box is still a scroll container, and the
    // browser scrolls it on its own to show whatever asks to be seen inside it
    // (a focus, a `scrollIntoView`, find-in-page, a text selection dragged
    // sideways). The track then sits that many pixels off for good, the slide
    // landing half way between two panes, since nothing ever scrolls it back.
    // A clipped box cannot be scrolled at all.
    <motion.div
      ref={containerRef}
      data-slot="tabs-contents"
      style={{ overflow: 'clip', position: 'relative' }}
      animate={{ height }}
      transition={transition}
      {...props}
    >
      <motion.div
        className="flex -mx-2"
        animate={{ x: activeIndex * -100 + '%' }}
        transition={transition}
      >
        {childrenArray.map((child, index) => (
          <div
            key={index}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className="w-full shrink-0 px-2 h-full"
          >
            {child}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

type TabsContentPrimitiveProps = WithAsChild<
  {
    value: string;
    children?: React.ReactNode;
  } & HTMLMotionProps<'div'>
>;

function TabsContentPrimitive({
  value,
  style,
  asChild = false,
  ...props
}: TabsContentPrimitiveProps) {
  const { activeValue } = useTabs();
  const isActive = activeValue === value;

  const Component = asChild ? Slot : motion.div;

  return (
    <Component
      role="tabpanel"
      data-slot="tabs-content"
      data-value={value}
      inert={!isActive}
      // No blur on inactive panels: every panel stays mounted, so on the listing
      // form nine full panels each held a live 4px filter, the costliest paint in
      // the app. The panels are inert while inactive, which is what mattered.
      // `clip` for the same reason as the track in `TabsContents`.
      style={{ overflow: 'clip', ...style }}
      {...props}
    />
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


type AnyProps = Record<string, unknown>;

type DOMMotionProps<T extends HTMLElement = HTMLElement> = Omit<
  HTMLMotionProps<keyof HTMLElementTagNameMap>,
  'ref'
> & { ref?: React.Ref<T> };

type WithAsChild<Base extends object> =
  | (Base & { asChild: true; children: React.ReactElement })
  | (Base & { asChild?: false | undefined });

type SlotProps<T extends HTMLElement = HTMLElement> = {
  children?: any;
} & DOMMotionProps<T>;

function mergeRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === 'function') {
        ref(node);
      } else {
        (ref as React.RefObject<T | null>).current = node;
      }
    });
  };
}

function mergeProps<T extends HTMLElement>(
  childProps: AnyProps,
  slotProps: DOMMotionProps<T>,
): AnyProps {
  const merged: AnyProps = { ...childProps, ...slotProps };

  if (childProps.className || slotProps.className) {
    merged.className = cn(
      childProps.className as string,
      slotProps.className as string,
    );
  }

  if (childProps.style || slotProps.style) {
    merged.style = {
      ...(childProps.style as React.CSSProperties),
      ...(slotProps.style as React.CSSProperties),
    };
  }

  return merged;
}

function Slot<T extends HTMLElement = HTMLElement>({
  children,
  ref,
  ...props
}: SlotProps<T>) {
  const isAlreadyMotion =
    typeof children.type === 'object' &&
    children.type !== null &&
    isMotionComponent(children.type);

  const Base = React.useMemo(
    () =>
      isAlreadyMotion
        ? (children.type as React.ElementType)
        : motion.create(children.type as React.ElementType),
    [isAlreadyMotion, children.type],
  );

  if (!React.isValidElement(children)) return null;

  const { ref: childRef, ...childProps } = children.props as AnyProps;

  const mergedProps = mergeProps(childProps, props);

  return (
    <Base {...mergedProps} ref={mergeRefs(childRef as React.Ref<T>, ref)} />
  );
}

export {
  Slot,
  type SlotProps,
  type WithAsChild,
  type DOMMotionProps,
  type AnyProps,
};


