import { TRIAL_MINUTES } from "@/lib/plans";

/** "Paste your link" entry point. Plain GET form: works before JavaScript loads. */
export function UrlForm({ id, className = "" }: { id: string; className?: string }) {
  return (
    <form
      action="/hire"
      className={`glass flex max-w-xl flex-col gap-2 rounded-[1.75rem] p-2 sm:flex-row sm:rounded-full ${className}`}
    >
      <label htmlFor={id} className="sr-only">
        Website link
      </label>
      <input
        id={id}
        name="url"
        type="url"
        required
        placeholder="https://your-site.com"
        className="h-12 rounded-full bg-transparent px-5 font-mono text-[15px] outline-none placeholder:text-graphite/70 sm:flex-1"
      />
      <button className="btn-primary group h-12 whitespace-nowrap">
        Start free {TRIAL_MINUTES}-min shift
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </form>
  );
}
