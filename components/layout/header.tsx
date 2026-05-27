import { cn, reverseSlugify } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import Parchment from "../graphics/background/Parchment"
import { paper } from "../graphics/styles"
import { AdminNavItem } from "../nav/admin-nav-item"
import AuthButtons from "../nav/auth-buttons"

export default async function Header({ path }: { path: string }) {
  const isBig = path === "" || path === "/" || path === "/start" || path === "/join"
  let settingSlug = null
  if (path.includes("/settings/")) {
    settingSlug = path.split("/")[2]
  }

  return (
    <header
      className={cn(
        paper.className,
        "fixed top-0 select-none z-30 flex sm:gap-1 items-center pr-2 sm:px-8 md:px-12 pt-1 sm:py-4 w-full max-w-[100vw] border-b-8 border-[rgba(0,0,0,.25)]",
        !isBig && "md:px-8 sm:py-0"
      )}
      style={paper.style}
    >
      <Parchment />
      <div className="flex flex-1 justify-start items-center">
        <Link className="cursor-pointer flex items-center font-display scale-90 sm:scale-100 gap-2 mix-blend-multiply" href="/">
          <Image
            className={cn("inline -mt-1 scale-90 sm:scale-100 w-12 h-12", isBig ? "sm:w-[72px] sm:h-[72px]" : "sm:w-8 sm:h-8")}
            width={isBig ? 72 : 36}
            height={isBig ? 72 : 36}
            alt=""
            src="/images/d20.jpg"
          />
          <div className="flex flex-col">
            <h1 className={cn(!isBig && "scale-[.8] sm:scale-[.6] -ml-5 sm:-ml-12 font-semibold")} aria-label="D20 Adventures">
              <span className="sr-only">D20 Adventures</span>
              <span aria-hidden="true">
                <span className={cn("text-2xl sm:text-4xl text-primary-600 mr-1", !isBig && "text-2xl")}>D20</span>
                <span className={cn("text-xl sm:text-3xl text-primary-500 relative -top-px", !isBig && "text-xl")}>A</span>
                <span className={cn("text-lg sm:text-2xl text-primary-500 relative -top-[3px]", !isBig && "text-sm")}>dventures</span>
              </span>
            </h1>
          </div>
        </Link>
        {settingSlug && (
          <Link
            href={`/settings/${settingSlug}`}
            className="text-sm -ml-2 font-display hidden sm:block text-yellow-950/80 hover:text-yellow-950/90 font-bold tracking-wide transition-all ease-in-out duration-500 font-bold"
          >
            {reverseSlugify(settingSlug)}
          </Link>
        )}
      </div>
      <div className="flex flex-1 justify-end items-center scale-90 sm:scale-100 -mt-1 sm:-mt-0 gap-4 sm:gap-8 pl-4">
        <AdminNavItem />
        <AuthButtons />
      </div>
    </header>
  )
}
