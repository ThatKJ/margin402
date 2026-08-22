import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { Mechanism } from "@/components/landing/Mechanism";
import { TheMoment } from "@/components/landing/TheMoment";
import { Verification } from "@/components/landing/Verification";
import { Economics } from "@/components/landing/Economics";
import { X402 } from "@/components/landing/X402";
import { MachineApi } from "@/components/landing/MachineApi";
import { StatementPeek } from "@/components/landing/StatementPeek";
import { Architecture } from "@/components/landing/Architecture";
import { FinalCta } from "@/components/landing/FinalCta";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Mechanism />
      <TheMoment />
      <Verification />
      <Economics />
      <X402 />
      <MachineApi />
      <StatementPeek />
      <Architecture />
      <FinalCta />
      <SiteFooter />
    </>
  );
}
