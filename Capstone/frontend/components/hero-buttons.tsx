"use client"

import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function HeroButtons() {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return (
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="bg-white text-emerald-600 hover:bg-gray-100">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-4">
      <Button asChild size="lg" className="bg-white text-emerald-600 hover:bg-gray-100">
        <Link href="/register">Get Started</Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="border-white text-black hover:bg-white/10">
        <Link href="/login">Login</Link>
      </Button>
    </div>
  )
}

export function CTAButton() {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return (
      <Button asChild size="lg" className="bg-white text-emerald-600 hover:bg-gray-100">
        <Link href="/dashboard" className="flex items-center gap-2">
          Go to Dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    )
  }

  return (
    <Button asChild size="lg" className="bg-white text-emerald-600 hover:bg-gray-100">
      <Link href="/register" className="flex items-center gap-2">
        Get Started <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  )
}

export function CardButton() {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return (
      <Button asChild className="w-full">
        <Link href="/dashboard">Go to Dashboard</Link>
      </Button>
    )
  }

  return (
    <Button asChild className="w-full">
      <Link href="/register">Create Account</Link>
    </Button>
  )
}
