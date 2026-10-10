import { TRIAL_MINUTES } from "@/lib/plans";

/** "Paste your link" entry point. Plain GET form: works before JavaScript loads. */
export function UrlForm({ id, className = "" }: { id: string; className?: string }) {
  return (
    <form
      action="/hire"
      className={`glass flex max-w-xl flex-col gap-2 rounded-[1.75rem] p-2 transition duration-300 focus-within:shadow-[0_0_0_1px_var(--color-dev),0_0_50px_-14px_var(--color-dev)] sm:flex-row sm:rounded-full ${className}`}
    >
      <label htmlFor={id} className="sr-only">
        Website link
      </label>
      <div className="flex flex-1 items-center gap-2 pl-4">
        <span aria-hidden className="font-mono text-dev">
          ›
        </span>
        <input
          id={id}
          name="url"
          type="url"
          required
          placeholder="https://your-site.com"
          className="h-12 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[15px] outline-none placeholder:text-graphite/70"
        />
      </div>
      <button className="btn-primary group h-12 whitespace-nowrap">
        Start free {TRIAL_MINUTES}-min shift
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </form>
  );
}
