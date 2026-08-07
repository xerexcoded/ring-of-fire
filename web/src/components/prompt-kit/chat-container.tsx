"use client";

import type { HTMLAttributes, ReactNode, RefObject } from "react";
import { StickToBottom } from "use-stick-to-bottom";
import { cn } from "@/lib/utils";

export type ChatContainerRootProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

export type ChatContainerContentProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

export type ChatContainerScrollAnchorProps = {
  className?: string;
  ref?: RefObject<HTMLDivElement>;
} & HTMLAttributes<HTMLDivElement>;

export function ChatContainerRoot({ children, className, ...props }: ChatContainerRootProps) {
  return (
    <StickToBottom
      className={cn("flex overflow-y-auto", className)}
      initial="instant"
      resize="smooth"
      role="log"
      {...props}
    >
      {children}
    </StickToBottom>
  );
}

export function ChatContainerContent({ children, className, ...props }: ChatContainerContentProps) {
  return (
    <StickToBottom.Content className={cn("flex w-full flex-col", className)} {...props}>
      {children}
    </StickToBottom.Content>
  );
}

export function ChatContainerScrollAnchor({ className, ...props }: ChatContainerScrollAnchorProps) {
  return <div className={cn("h-px w-full shrink-0 scroll-mt-4", className)} aria-hidden="true" {...props} />;
}
