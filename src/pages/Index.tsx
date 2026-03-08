import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HeroSection from "@/components/landing/HeroSection";
import MarqueeTicker from "@/components/landing/MarqueeTicker";
import ProblemSection from "@/components/landing/ProblemSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import VaultsSection from "@/components/landing/VaultsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PeruSection from "@/components/landing/PeruSection";

import ManifestoSection from "@/components/landing/ManifestoSection";
import WaitlistSection from "@/components/landing/WaitlistSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-14">
        <HeroSection />
        <MarqueeTicker />
        <ProblemSection />
        <HowItWorksSection />
        <VaultsSection />
        <TestimonialsSection />
        <PeruSection />
        
        <ManifestoSection />
        <WaitlistSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
