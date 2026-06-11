import { cn } from "@/lib/utils"
import type * as React from "react"

type NativeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "loading"> & {
  src: string
  alt: string
  fill?: boolean
  priority?: boolean
  sizes?: string
  loading?: "eager" | "lazy"
}

export default function NativeImage({ src, alt, fill, priority, className, width, height, loading, sizes: _sizes, ...props }: NativeImageProps) {
  return (
    <img
      {...props}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : loading}
      fetchPriority={priority ? "high" : props.fetchPriority}
      className={cn(fill && "absolute inset-0 h-full w-full", className)}
    />
  )
}
