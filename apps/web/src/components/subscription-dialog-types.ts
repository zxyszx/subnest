import type { ReactNode } from "react";
import type {
  Subscription,
  SubscriptionCollectionItem,
  SubscriptionFormSubmission,
} from "@/types/subscription";

export type SubscriptionPlatformSuggestion = {
  name: string;
  label?: string;
  value?: string;
  logo?: string | null | undefined;
  accounts?: readonly {
    id: string;
    accountNumber: number;
  }[] | undefined;
};

type CreateSubscriptionDialogProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (submission: SubscriptionFormSubmission) => void | Promise<void>;
  initialSubscription?: Subscription | null | undefined;
  availableTags?: readonly string[] | undefined;
  platformSuggestions?: readonly SubscriptionPlatformSuggestion[] | undefined;
  trigger?: ReactNode;
  loading?: boolean | undefined;
  loadingPreview: SubscriptionCollectionItem | null;
};

type EditSubscriptionDialogProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  onSubmit: (submission: SubscriptionFormSubmission) => void | Promise<void>;
  availableTags?: readonly string[] | undefined;
  platformSuggestions?: readonly SubscriptionPlatformSuggestion[] | undefined;
  loading?: boolean | undefined;
  loadingPreview: SubscriptionCollectionItem | null;
};

export type SubscriptionDialogProps = CreateSubscriptionDialogProps | EditSubscriptionDialogProps;

export type SubscriptionDialogContentProps = SubscriptionDialogProps & {
  onNestedDialogOpenChange: (open: boolean) => void;
  onRequestClose: () => void;
};
