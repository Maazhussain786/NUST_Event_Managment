'use client';

import clsx from 'clsx'
import { motion } from 'framer-motion'

const FUIHeroWithBorders = () => {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.2
            }
        }
    }

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: {
                type: 'spring',
                damping: 25,
                stiffness: 100
            }
        }
    }

    return (
        <section className="relative min-h-[calc(100vh-50px)] overflow-hidden bg-[linear-gradient(to_bottom,#fff,#CCEEFF_40%,#00AEEF_88%)] dark:bg-[linear-gradient(to_bottom,#000,#082f49_40%,#00AEEF_74%,#38BDF8_88%_50%)]">

            <motion.div 
                initial={{ opacity: 0, scale: 0.95, x: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%' }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute left-1/2 bottom-[-410px] lg:bottom-[-600px] h-[500px] w-[700px] md:h-[500px] md:w-[1100px] lg:h-[750px] lg:w-[100%] rounded-[100%] border-[#00AEEF] bg-black bg-[radial-gradient(closest-side,#000_82%,#00AEEF)] z-0 pointer-events-none"
            ></motion.div>
            
            <div className="dark:border-dark-border absolute left-0 top-0 z-0 grid h-full w-full grid-cols-[clamp(28px,10vw,120px)_auto_clamp(28px,10vw,120px)] border-b border-border">
                <div className="col-span-1 flex h-full items-center justify-center" />
                <div className="dark:border-dark-border col-span-1 flex h-full items-center justify-center border-x border-white/10" />
                <div className="col-span-1 flex h-full items-center justify-center" />
            </div>
            
            <motion.figure 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ duration: 2, delay: 0.5 }}
                className="bg-brand pointer-events-none absolute -bottom-[70%] left-1/2 z-0 block aspect-square w-[520px] -translate-x-1/2 rounded-full blur-[200px]" 
            />
            
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="dark:divide-dark-border relative z-10 flex flex-col divide-y divide-white/10 pt-[35px]"
            >
                <div className="mt-16 md:mt-12">
                    <motion.div 
                        variants={itemVariants}
                        className="mx-auto flex min-h-[288px] max-w-[80vw] shrink-0 flex-col items-center justify-center gap-6 px-4 py-12 sm:px-10 lg:px-24 backdrop-blur-md bg-white/40 dark:bg-black/40 rounded-3xl border-2 border-white/40 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative z-20"
                    >
                        <motion.h1 
                            variants={itemVariants}
                            className="text-black dark:text-white text-pretty text-center text-4xl sm:text-5xl md:text-6xl lg:text-[clamp(50px,7vw,75px)] font-extrabold leading-tight tracking-[-1.44px] md:max-w-screen-lg md:tracking-[-2.16px] drop-shadow-sm"
                        >
                            Central Hub for NUST Events & Societies
                        </motion.h1>
                        <motion.h2 
                            variants={itemVariants}
                            className="text-md text-black/80 dark:text-white/80 max-w-2xl text-pretty text-center md:text-xl font-medium drop-shadow-sm"
                        >
                            Discover, manage, and participate in events hosted by SEECS, NBS, and other leading schools across the NUST campus.
                        </motion.h2>
                    </motion.div>
                </div>

                <motion.div 
                    variants={itemVariants}
                    className="flex items-start justify-center px-8 sm:px-24 pt-10 relative z-20"
                >
                    <div className="flex w-full max-w-[80vw] flex-col md:flex-row items-center justify-center gap-4 md:!max-w-[500px]">
                        <a href="/events" className="cursor-pointer w-full md:w-1/2 block">
                            <div
                                className={clsx(
                                    'flex !h-14 items-center justify-center rounded-xl !text-base font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)]',
                                    'w-full border-2 border-brand/20 dark:border-white/10 bg-white/80 dark:bg-black/50 backdrop-blur-xl transition-all duration-300 hover:bg-white dark:hover:bg-black hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] active:scale-[0.98] text-black dark:text-white'
                                )}
                            >
                                Explore Events
                            </div>
                        </a>
                        <a href="/login" className="cursor-pointer w-full md:w-1/2 block group/btn relative">
                            <div className="absolute inset-0 bg-brand blur-xl opacity-30 group-hover/btn:opacity-60 transition-opacity duration-300 rounded-xl"></div>
                            <div
                                className={clsx(
                                    'flex !h-14 items-center justify-center rounded-xl !text-lg font-bold text-white shadow-[0_8px_32px_rgba(0,174,239,0.4)] overflow-hidden',
                                    'w-full bg-gradient-to-tr from-[#0284C7] via-brand to-[#38BDF8] border border-white/20 transition-all duration-300 hover:scale-[1.05] hover:shadow-[0_12px_48px_rgba(0,174,239,0.7)] active:scale-[0.95] relative z-10'
                                )}
                            >
                                <span className="drop-shadow-md flex items-center gap-2 relative z-20 transition-transform group-hover/btn:scale-110">
                                    Sign In
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover/btn:translate-x-1"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                </span>
                            </div>
                        </a>
                    </div>
                </motion.div>
                <motion.div 
                    variants={itemVariants}
                    className="mx-auto max-w-7xl w-full"
                >
                    <AnimatedLogoCloud />
                </motion.div>
            </motion.div>
        </section>
    )
}

export default FUIHeroWithBorders

const schools = [
    'SEECS', 'NBS', 'NSHS', 'SMME', 'SCEE', 'SCME', 'SINES', 'SADA', 'SNS', 'S3H', 'ASAB', 'NIPCONS', 'MCS', 'MCE', 'EME', 'NLS', 'NCLS'
]

const AnimatedLogoCloud = () => {
    return (
        <div className="w-full py-16 md:py-24">
            <div className="mx-auto w-full px-4 md:px-8">
                <style>{`
                  @keyframes x-slider {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                  }
                  .animate-x-slider {
                    animation: x-slider 30s linear infinite;
                  }
                `}</style>
                <div
                    className="group relative flex overflow-hidden p-2"
                    style={{
                        maskImage:
                            'linear-gradient(to left, transparent 0%, black 15%, black 85%, transparent 100%)',
                        WebkitMaskImage:
                            'linear-gradient(to left, transparent 0%, black 15%, black 85%, transparent 100%)',
                    }}
                >
                    {/* We double the content to allow smooth infinite scrolling */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 1 }}
                        className="flex shrink-0 animate-x-slider flex-row min-w-max gap-8 md:gap-16 items-center"
                    >
                        {[...schools, ...schools].map((school, key) => (
                            <div
                                key={key}
                                className="flex-none"
                            >
                                <span className="text-3xl md:text-5xl font-black text-black/10 dark:text-white/10 select-none tracking-tighter uppercase font-sans">
                                    {school}
                                </span>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </div>
        </div>
    )
}
