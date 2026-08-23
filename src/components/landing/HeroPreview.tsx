const STREAM_ITEMS = [
  {
    tone: "brand" as const,
    title: "Payment recovered",
    detail: "payment_link.paid · ₹4,200",
    time: "2m ago",
  },
  {
    tone: "warning" as const,
    title: "Risk detected",
    detail: "Failed payment · ₹1,850 · card declined",
    time: "9m ago",
  },
  {
    tone: "ink" as const,
    title: "Recovery strategy selected",
    detail: "send_payment_link · confidence 0.92",
    time: "12m ago",
  },
  {
    tone: "danger" as const,
    title: "Guardrail triggered",
    detail: "Retry limit reached · escalated to human",
    time: "31m ago",
  },
];

const TONE_DOT: Record<string, string> = {
  brand: "bg-brand",
  warning: "bg-warning",
  ink: "bg-slate-400",
  danger: "bg-danger",
};

function StreamItem({
  item,
}: {
  item: (typeof STREAM_ITEMS)[number];
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[item.tone]}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-5 text-slate-100">
          {item.title}
        </p>
        <p className="truncate text-[11px] leading-4 text-slate-400">
          {item.detail}
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-slate-500">{item.time}</span>
    </li>
  );
}

export function HeroPreview() {
  const metrics = [
    { label: "Revenue at Risk", value: "₹2.48L", accent: "text-warning" },
    { label: "Recovered Revenue", value: "₹1.72L", accent: "text-emerald-400" },
    { label: "Recovery Rate", value: "69.4%", accent: "text-white" },
  ];

  return (
    <figure className="relative mx-auto mt-14 w-full max-w-5xl">
      {/* Glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-8 -top-10 bottom-10 rounded-[32px] bg-[radial-gradient(50%_60%_at_50%_20%,rgba(22,163,74,0.16),transparent)]"
      />

      <div className="relative overflow-hidden rounded-2xl border border-navy-line bg-navy shadow-raised">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-navy-line px-5 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </span>
          <span className="mx-auto flex items-center gap-2 rounded-md border border-navy-line bg-navy-raised px-3 py-1 text-[11px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            revyn.app/dashboard
          </span>
          <span className="w-14" aria-hidden="true" />
        </div>

        <div className="grid gap-px bg-navy-line/50 md:grid-cols-5">
          {/* Metrics panel */}
          <div className="bg-navy p-6 md:col-span-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold tracking-tight text-white">
                Revenue Recovery
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-line bg-navy-raised px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                Test mode
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-3">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-navy-line bg-navy-raised p-4"
                >
                  <dt className="truncate text-[11px] font-medium leading-4 text-slate-400">
                    {m.label}
                  </dt>
                  <dd
                    className={`mt-1.5 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${m.accent}`}
                  >
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Mini bar visual */}
            <div className="mt-5 flex h-16 items-end gap-1.5" aria-hidden="true">
              {[38, 52, 30, 64, 44, 78, 58, 88, 70, 96].map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`flex-1 rounded-t-sm ${
                    i >= 7 ? "bg-emerald-500/80" : "bg-slate-600/60"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Activity stream */}
          <div className="border-t border-navy-line/50 bg-navy md:col-span-2 md:border-l md:border-t-0">
            <div className="flex items-center justify-between px-5 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Recovery activity
              </p>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            </div>
            <ul className="mt-2 divide-y divide-navy-line/40 pb-2">
              {STREAM_ITEMS.map((item) => (
                <StreamItem key={item.title} item={item} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <figcaption className="mt-3 text-center text-xs text-faint">
        Product preview with illustrative demo values — the live dashboard runs
        on your real recovery data.
      </figcaption>
    </figure>
  );
}
