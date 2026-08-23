import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 19V5m0 7h9a5 5 0 0 1 0 10H8"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconRadar(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={5} />
      <circle cx={12} cy={12} r={1} fill="currentColor" stroke="none" />
      <path d="M12 3v2M21 12h-2" />
    </Base>
  );
}

export function IconDiagnose(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={11} cy={11} r={7} />
      <path d="m16.2 16.2 4.3 4.3" />
      <path d="M8.5 11h1.6l1-2.2 1.6 4 1-1.8h1.8" />
    </Base>
  );
}

export function IconDecide(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={6} cy={5} r={2.2} />
      <circle cx={18} cy={19} r={2.2} />
      <circle cx={6} cy={19} r={2.2} />
      <path d="M6 7.2v9.6" />
      <path d="M18 16.8c0-4-4-5-7-5.5-2.4-.4-4-1.3-4-3" />
    </Base>
  );
}

export function IconSend(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M21.5 2.5 11 13" />
      <path d="M21.5 2.5 14.5 21l-3.5-8-8-3.5 18.5-7Z" />
    </Base>
  );
}

export function IconChart(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M6.5 20.5v-6" />
      <path d="M12 20.5V9" />
      <path d="M17.5 20.5V4.5" />
    </Base>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2.8 19 5.6v5.2c0 4.7-2.9 8.2-7 10.4-4.1-2.2-7-5.7-7-10.4V5.6L12 2.8Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </Base>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </Base>
  );
}

export function IconArrowUpRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </Base>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 3.5V9H15" />
    </Base>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5 22 20.5H2L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </Base>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="m8.2 12.4 2.6 2.6 5-5.4" />
    </Base>
  );
}

export function IconXCircle(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </Base>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3.2 1.8" />
    </Base>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 12h3.5l3-6.5 4.5 13 3-6.5H21" />
    </Base>
  );
}

export function IconRepeat(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </Base>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={9} cy={8} r={3.5} />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16.2 4.9a3.5 3.5 0 0 1 0 6.2" />
      <path d="M17.8 14.2A6.2 6.2 0 0 1 21.4 20" />
    </Base>
  );
}

export function IconGauge(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 19a9 9 0 1 1 15 0" />
      <path d="m12 14 4-4.5" />
      <circle cx={12} cy={14} r={1.2} fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconCreditCard(props: IconProps) {
  return (
    <Base {...props}>
      <rect x={2.5} y={5} width={19} height={14} rx={2.5} />
      <path d="M2.5 10h19" />
      <path d="M6 15h3.5" />
    </Base>
  );
}

export function IconReceipt(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5.5 2.5h13v19l-2.2-1.6-2.1 1.6-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6v-19Z" />
      <path d="M9 8h6M9 12h6" />
    </Base>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </Base>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Base>
  );
}

export function IconExternalLink(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V14" />
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
    </Base>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx={11} cy={11} r={6.5} />
      <path d="m15.8 15.8 4.4 4.4" />
    </Base>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10H12l1-7.5Z" />
    </Base>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Base {...props}>
      <rect x={4.5} y={10.5} width={15} height={10} rx={2.5} />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2.5" />
    </Base>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M22 12h-5.5l-1.8 3h-5.4l-1.8-3H2" />
      <path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1Z" />
    </Base>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m4.6 12.7-1.6.9 9 5 9-5-1.6-.9" />
      <path d="m4.6 16.7-1.6.9 9 5 9-5-1.6-.9" />
    </Base>
  );
}
