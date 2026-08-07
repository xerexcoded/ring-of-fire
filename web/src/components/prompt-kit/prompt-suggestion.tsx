"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PromptSuggestionProps = {
  children: ReactNode;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function PromptSuggestion({
  children,
  variant = "outline",
  size = "lg",
  className,
  type = "button",
  ...props
}: PromptSuggestionProps) {
  return (
    <Button
      variant={variant}
      size={size}
      type={type}
      className={cn("rounded-full", className)}
      {...props}
    >
      {children}
    </Button>
  );
}
