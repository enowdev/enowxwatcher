import * as LabelPrimitive from "@radix-ui/react-label";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../../lib/utils.ts";

export const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />
));
Label.displayName = "Label";
