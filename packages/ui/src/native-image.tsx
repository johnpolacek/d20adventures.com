import type * as React from "react"
import { cn } from "./utils"

type NativeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "loading"> & {
  src: string
  alt: string
  fill?: boolean
  priority?: boolean
  sizes?: string
  loading?: "eager" | "lazy"
  ref?: React.Ref<HTMLImageElement>
}

export default function NativeImage({ src, alt, fill, priority, className, width, height, loading, ...props }: NativeImageProps) {
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
