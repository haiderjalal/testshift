/** "Paste your link" entry point. Plain GET form: works before JavaScript loads. */
export function UrlForm({ id, className = "" }: { id: string; className?: string }) {
  return (
    <form action="/hire" className={`flex max-w-xl flex-col gap-2 sm:flex-row ${className}`}>
      <label htmlFor={id} className="sr-only">
        Website link
      </label>
      <input
        id={id}
        name="url"
        type="url"
        required
        placeholder="https://your-site.com"
        className="h-12 rounded-full border border-rule bg-card px-5 text-base shadow-sm outline-none placeholder:text-graphite/70 focus:border-ink sm:flex-1"
      />
      <button className="group h-12 rounded-full bg-ink px-6 font-medium text-paper transition hover:bg-ink/85 active:scale-[0.98]">
        Book a shift{" "}
        <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </form>
  );
}
