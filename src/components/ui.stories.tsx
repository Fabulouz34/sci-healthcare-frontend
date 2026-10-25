import type { Meta, StoryObj } from '@storybook/nextjs';

import {
  Alert,
  Button,
  Card,
  Empty,
  ExplorerLink,
  Field,
  InfoTip,
  Modal,
  StatusBadge,
  Tooltip,
} from './ui';

const meta: Meta = {
  title: 'UI/Primitives',
};

export default meta;

// Button variants: primary, ghost, danger, disabled.
export const Buttons: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button>Primary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

export const StatusBadges: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="Funded" />
      <StatusBadge status="Claimed" />
      <StatusBadge status="Attested" />
      <StatusBadge status="Settled" />
      <StatusBadge status="Disputed" />
      <StatusBadge status="Refunded" />
    </div>
  ),
};

export const Alerts: StoryObj = {
  render: () => (
    <div className="space-y-2">
      <Alert>Something went wrong.</Alert>
      <Alert kind="info">Heads up: the dispute window is still open.</Alert>
      <Alert kind="success">
        Done. <ExplorerLink href="https://example.com">View transaction</ExplorerLink>
      </Alert>
    </div>
  ),
};

export const FieldsAndCards: StoryObj = {
  render: () => (
    <Card className="space-y-3 p-5">
      <Field label="Clinic received">
        <span className="mono">$3.00</span>
      </Field>
      <Field label="Expires">19 Jun 2026</Field>
    </Card>
  ),
};

export const EmptyState: StoryObj = {
  render: () => (
    <Empty
      title="No vouchers yet"
      description="Pick a clinic and fund care to see your vouchers here."
      action={<Button>Find a clinic</Button>}
    />
  ),
};

export const EmptyStates: StoryObj = {
  render: () => (
    <div className="space-y-3">
      <Empty
        title="No vouchers yet"
        description="Pick a clinic and fund care to see your vouchers here."
        action={<Button>Find a clinic</Button>}
      />
      <Empty
        title="No services listed yet"
        description="Publish the services your clinic offers so funders can pay for them."
        action={<Button>List a service</Button>}
      />
      <Empty
        title="No clinics match your search"
        description="Try a different service or clear the filters."
        action={<Button variant="ghost">Clear search</Button>}
      />
    </div>
  ),
};

export const TooltipBasic: StoryObj = {
  render: () => (
    <p className="text-sm text-[var(--color-ink-soft)]">
      Dispute window closes in 3d — settles after that.
      <Tooltip content="The funder can dispute before the window closes. After it closes, anyone can release the payment.">
        <span
          tabIndex={0}
          className="ms-1 inline-grid h-w-4 w-4 cursor-help place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-canvas)] text-[10px]"
        >
          ?
        </span>
      </Tooltip>
    </p>
  ),
};

export const InfoTisHint: StoryObj = {
  render: () => (
    <p className="text-sm">
      Funds are escrowed by the contract.
      <InfoTip content="Released to the clinic only after an attester confirms delivery." />
    </p>
  ),
};

export const ModalDispute: StoryObj = {
  render: () => (
    <Modal
      open
      onClose={() => {}}
      title="Open dispute"
      actions={
        <>
          <Button variant="danger">Open dispute</Button>
          <Button variant="ghost">Cancel</Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-ink-soft)]">
        The clinic will not be paid while this is open. An administrator reviews
        it and returns the money to you or releases it to the clinic.
      </p>
    </Modal>
  ),
};

export const ModalAttest: StoryObj = {
  render: () => (
    <Modal
      open
      onClose={() => {}}
      title="Confirm care delivered"
      actions={
        <>
          <Button>Confirm</Button>
          <Button variant="ghost">Cancel</Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-ink-soft)]">
        Confirm only care you have actually verified. Confirming opens a dispute
        window, after which the clinic is paid.
      </p>
    </Modal>
  ),
};
