"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const Header = () => (
  <header className="w-full absolute top-0 z-50 transition-all duration-300">
    <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <div className="flex items-center gap-3 text-white">
        <div className="size-8 text-white">
          <svg
            className="w-full h-full"
            fill="none"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g fill="currentColor">
              <path d="M49.998,0C22.381,0,0,22.388,0,49.998C0,77.61,22.381,100,49.998,100c27.611,0,49.998-22.39,49.998-50.001  C99.996,22.388,77.609,0,49.998,0z M49.998,85.712c-19.727,0-35.718-15.992-35.718-35.714c0-19.72,15.991-35.711,35.718-35.711  c19.722,0,35.711,15.991,35.711,35.711C85.709,69.72,69.72,85.712,49.998,85.712z"></path>
              <path d="M46.215,36.287c-1.807,0.495-3.507,1.354-5.044,2.567c-0.492,0.343-0.924,0.69-1.275,1.043  c-0.357,0.351-0.703,0.783-1.046,1.278c-1.214,1.533-2.072,3.237-2.567,5.04c-3.793,9.291-6.488,23.986-6.488,23.986  s14.699-2.7,23.984-6.492c1.8-0.495,3.509-1.35,5.037-2.563c0.495-0.349,0.928-0.694,1.283-1.046  c0.349-0.35,0.697-0.781,1.039-1.277c1.214-1.534,2.072-3.236,2.567-5.036c3.795-9.292,6.495-23.991,6.495-23.991  S55.502,32.493,46.215,36.287z M52.523,52.524c-1.397,1.395-3.654,1.395-5.051,0c-1.397-1.397-1.397-3.654,0-5.051  s3.653-1.397,5.051,0C53.919,48.87,53.919,51.126,52.523,52.524z"></path>
            </g>
          </svg>
        </div>
        <h2 className="text-xl font-bold tracking-tight">Drift</h2>
      </div>
      <nav className="hidden md:flex items-center gap-8">
        <a
          className="text-white/90 hover:text-white text-sm font-medium transition-colors"
          href="#"
        >
          My Trips
        </a>
        <a
          className="text-white/90 hover:text-white text-sm font-medium transition-colors"
          href="#"
        >
          Saved
        </a>
        <a
          className="text-white/90 hover:text-white text-sm font-medium transition-colors"
          href="#"
        >
          Community
        </a>
      </nav>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex gap-3">
          <button className="flex items-center justify-center rounded-full h-10 px-6 bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-colors">
            Log In
          </button>
          <button className="flex items-center justify-center rounded-full h-10 px-6 bg-white text-primary text-sm font-bold shadow-lg hover:bg-gray-50 transition-colors">
            Sign Up
          </button>
        </div>
        <div
          className="bg-center bg-no-repeat bg-cover rounded-full size-10 border-2 border-white/30 cursor-pointer shadow-md"
          style={{
            backgroundImage:
              'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDr76QnktfFBOseLn7Nmqdl_1TNBrhuEzMt3qUFQVteLVY0drNGRKJ1ymAS3_gC5_E_8b1JA3SrUaT6KS9uOydG8CZrlrl_tGPczEnDxPAuXJEhnJZ96jK0WVp-gCUsUUd_lTuBlJPndYDfQ4WZz2beMcevmlPIvViIK7k1hYwXm3iGSLnQ4f5Ex_YR3FfqV3i7a0_qCnu0TE8Iwm-_Z6Vo6Uvi6Jh5ODLUpNwfTNRrJdKRyJjgQZya2WIzKlwFCmOqGxNaDbiFrm-c")',
          }}
        ></div>
      </div>
    </div>
  </header>
);

const TrendingCard = ({
  img,
  title,
  desc,
  tag,
}: {
  img: string;
  title: string;
  desc: string;
  tag: string;
}) => {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push("/itinerary")}
      className="group relative h-96 rounded-[1.5rem] overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300 ring-1 ring-black/5"
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
        style={{ backgroundImage: `url("${img}")` }}
      ></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-90 transition-opacity"></div>
      <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
        <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold text-white mb-3 border border-white/10">
          {tag}
        </span>
        <h4 className="text-white text-2xl font-bold mb-1 drop-shadow-sm">
          {title}
        </h4>
        <p className="text-gray-200 text-sm mb-4 line-clamp-2 drop-shadow-sm">
          {desc}
        </p>
        <button className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 text-sm shadow-lg">
          <span>Plan this trip</span>
          <span className="material-symbols-outlined text-sm">
            auto_awesome
          </span>
        </button>
      </div>
    </div>
  );
};

import { LoadingOverlay } from "@/components/LoadingOverlay";
import { motion } from "framer-motion";

export default function Home() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [isExiting, setIsExiting] = useState(false);

  const handleGenerate = () => {
    if (!searchTerm) return;

    const params = new URLSearchParams();
    params.set('destination', searchTerm);

    // Signal that we're in loading state
    params.set('loading', 'true');

    // Start exit animation
    setIsExiting(true);

    // Navigate after exit animation completes (800ms delay)
    setTimeout(() => {
      router.push(`/itinerary?${params.toString()}`);
    }, 800);
  };

  return (
    <>
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col overflow-x-hidden font-body text-gray-900 dark:text-gray-100">
        <Header />
        <motion.main
          className="flex-grow flex flex-col relative"
          animate={isExiting
            ? { y: 20, opacity: 0, filter: "blur(10px)" }
            : { y: 0, opacity: 1, filter: "blur(0px)" }
          }
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <div className="relative min-h-[85vh] flex flex-col items-center justify-center px-4 md:px-8 overflow-hidden">
            {/* Video Background */}
            <div className="absolute inset-0 z-0 bg-slate-900">
              <video
                autoPlay
                muted
                loop
                playsInline
                poster="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80"
                className="w-full h-full object-cover"
              >
                <source src="/waves.mp4" type="video/mp4" />
              </video>
              {/* Dark overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60"></div>
            </div>
            {/* Inline style for hero bg since it was specialized in HTML */}
            <style jsx>{`
             /* Custom Date Input Styling */
            input[type="date"]::-webkit-calendar-picker-indicator {
                cursor: pointer;
                opacity: 0.6;
                filter: invert(0.5);
            }
            
            /* Double Slider Styling */
            .slider-thumb-only::-webkit-slider-thumb {
                pointer-events: auto;
                -webkit-appearance: none;
                height: 16px;
                width: 16px;
                border-radius: 50%;
                background: #6366f1;
                border: 2px solid white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                cursor: pointer;
                margin-top: -5px; /* Adjust based on track height if needed */
            }
            .slider-thumb-only::-moz-range-thumb {
                pointer-events: auto;
                height: 16px;
                width: 16px;
                border-radius: 50%;
                background: #6366f1;
                border: 2px solid white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                cursor: pointer;
                border: none;
            }
            .slider-thumb-only::-webkit-slider-runnable-track {
                background: transparent;
                height: 100%;
            }
            .slider-thumb-only::-moz-range-track {
                background: transparent;
                height: 100%;
            }
           `}</style>
            <div className="w-full max-w-4xl relative z-10 flex flex-col items-center gap-8 mt-16">
              <div className="text-center space-y-6 animate-fade-in-up">
                <h1 className="text-white text-5xl md:text-7xl font-black leading-tight tracking-tight drop-shadow-xl font-display">
                  Where to next?
                </h1>
                <p className="text-white/95 text-xl md:text-2xl max-w-2xl mx-auto font-light leading-relaxed drop-shadow-lg text-shadow-sm">
                  Your personal AI travel curator. From dream to destination in
                  seconds.
                </p>
              </div>
              <div className="w-full max-w-3xl bg-white/95 backdrop-blur-md border border-white/40 rounded-[2rem] shadow-2xl p-2 md:p-3 flex flex-col gap-2 mt-8 transform transition-all duration-300">
                <div className="flex flex-col md:flex-row items-center gap-2 p-2">
                  <div className="flex-grow w-full md:w-auto relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-gray-400 group-focus-within:text-primary transition-colors">
                        search
                      </span>
                    </div>
                    <input
                      className="w-full bg-transparent border-none rounded-xl py-3 pl-12 pr-4 text-gray-800 placeholder-gray-400 focus:ring-0 text-xl font-medium outline-none"
                      placeholder="Ex: 10 days in Italy under $3k..."
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                    />
                  </div>
                  <button
                    onClick={handleGenerate}
                    className="w-full md:w-auto shrink-0 bg-primary hover:bg-primary-dark text-white font-bold text-lg px-8 py-3.5 rounded-2xl shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">
                      auto_awesome
                    </span>
                    <span>Generate</span>
                  </button>
                </div>
              </div>
              {/* Removed the +2k user stats section as requested */}
            </div>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
              <span className="material-symbols-outlined text-white text-4xl opacity-80 drop-shadow-md">
                keyboard_arrow_down
              </span>
            </div>
          </div>
          <div className="bg-background-light dark:bg-slate-900 py-16 px-4 md:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
                <div>
                  <h3 className="text-slate-900 dark:text-white text-3xl font-bold mb-2 font-display">
                    Trending Destinations
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400">
                    Curated by our AI based on recent popularity.
                  </p>
                </div>
                <a
                  className="text-primary hover:text-primary-dark font-medium flex items-center gap-1 group"
                  href="#"
                >
                  Explore all
                  <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform text-lg">
                    arrow_forward
                  </span>
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <TrendingCard
                  img="https://lh3.googleusercontent.com/aida-public/AB6AXuASxqmMuhJPzc1TvuI0C3qtacP0RDFfABbzW2-V78vY2GWGkgYFk1f2wcic-fPlfDM8lKHyfRZn7BITe6_GE_-O8MoOLyAXmKh8OSRKDxbHHA0c6KptaTaxRo96D5z88znkerKLCR_IuEhlvqAUY1IQ0hpPQAVEqNzYMMZGE--hEqEoAp2gYw5ZanOz3rJ80d828V_cQdYtPvjdonFEkzCi9qqEmSC7jIDXPSMUn1WqMAewB4xwdU9Zco_4cWFH2XJl3OJVmWR2jT-d"
                  tag="Cultural"
                  title="Japan"
                  desc="Experience the perfect blend of ancient tradition and futuristic innovation in Tokyo and Kyoto."
                />
                <TrendingCard
                  img="https://lh3.googleusercontent.com/aida-public/AB6AXuCCfPg-6TfE-xZ4smcNA_1Nx9tJlNdgMIKcl3BvalQoOH_wa0Ly-joJW4peeZTvDhhXl6FFZwZG-LHGuUtC18SLq6np4FesFUPc7dhj1vvoG6WpjoHFYB87ZJe6BrmwHYOou7P21hgLT2zwc0HAEsWzt7jH7FS-qvwkllmakJWRtMfP18wM4zhKtbos9ybpcsWSwn2SyDZoA1ExoBhDjkwixUWbD7COUoTqCM2kHdbEdSqfsBpkVuM2fNEfBdJAYJpwUXx06iuCujC8"
                  tag="Coastal"
                  title="Amalfi Coast"
                  desc="Breathtaking views, crystal clear waters, and authentic Italian cuisine waiting for you."
                />
                <TrendingCard
                  img="https://lh3.googleusercontent.com/aida-public/AB6AXuAdhKB_9_j3d-WGZMx_1GZCpUVCq7WYN9AHcGESMJcy4zIsu-kulXCu6uhCC_U_yEKu4ztjYk4CdYsCdi5fNN-rFZhHC9Hm133poXzI77ZimhPU6nrsHkYMSbGjvA4OouIX-Kmm2lnuN4iQR1dDGs7vcNKQrS9bz6wI9HMCIEEZJolH8SkjJ3wTXXv5QQXeqCE7u79nd6BGijLWuDdQCsPpqV7wZ-M0jXv9_NKHbZ54zwBXfo_RbC3-m7RLO3h-gIqvyB-xBxaBMiu9"
                  tag="Adventure"
                  title="Iceland"
                  desc="Chase the Northern Lights and explore dramatic landscapes of fire and ice."
                />
                <TrendingCard
                  img="https://lh3.googleusercontent.com/aida-public/AB6AXuCBhGxTbNNdCSP668FRaUdonUasBFJ0TmDs_oCzxSiC305juYYBQrfDU0auQlKCdqE5_qzxIoBVkgMFjMcQu3_1qYTpTC2TLpPOIY36Y49ReVyWNdzwuneU-ZYxASFsxyfah5Qnjpz0rI_pUV7LtxL2QjmhBXrqD6zTIK3eZwREk89Fe5FrVdVQjb9Eo_pkFuZcIn7-Y7t4E1vRi_aF-RBm5So2UVLzCcIoh_AJJ10pVfcUdJ2edM2STn8CRQlclO3o8GL_I3QiWDfW"
                  tag="Tropical"
                  title="Bali"
                  desc="Discover spiritual temples, lush jungles, and serene beaches in paradise."
                />
              </div>
            </div>
          </div>
        </motion.main>
      </div>

      {/* Loading Overlay for exit transition - renders at bottom to cover everything */}
      {isExiting && (
        <LoadingOverlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
    </>
  );
}
