"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

interface Pet {
  id: string;
  name: string;
  category: string;
  stats: {
    공격력: string;
    방어력: string;
    순발력: string;
    성장률: string;
    내구력: string;
    속성: string;
    탑승여부: string;
  };
  image_url: string;
  local_image: string;
  detail_url: string;
  init_stats_decimal?: {
    hp: number;
    atk: number;
    def: number;
    agi: number;
  };
}

type SortOption = "name" | "id" | "growth" | "attack";

interface PopoverData {
  dangerStats: { name: string; decimal: number; display: number }[];
  safeStats: { name: string; decimal: number; display: number }[];
  allSafe: boolean;
  allCombos: string[];
}

const calculatePops = (initStats?: {
  hp: number;
  atk: number;
  def: number;
  agi: number;
}): PopoverData | null => {
  if (!initStats) return null;

  // S급 정석 표기 능력치 (정수 = 게임 내 표시값)
  const sGrade = {
    hp: Math.floor(initStats.hp),
    atk: Math.floor(initStats.atk),
    def: Math.floor(initStats.def),
    agi: Math.floor(initStats.agi),
  };

  // 소수점 분석: 각 스탯의 안전도 판별
  // -------------------------------------------------------
  // 소수점이 높을수록 (예: 9.95 → .95) 위험:
  //   - 정석(표기 9) 잡아도 실제론 9.01일 가능성 높음 (통수)
  //   - 표기 -1 (8) 뜨면 평균 ~1.5 실제 손실 → 큰 손해
  //
  // 소수점이 낮을수록 (예: 9.05 → .05) 안전:
  //   - 정석(표기 9) 잡으면 S급 거의 확정
  //   - 표기 -1 (8) 떠도 8.9일 수 있음 → 실제 손실 적음
  //
  // 소수점 0 (예: 9.00) → 가장 안전:
  //   - 표기 9 = S급 이상 확정, -1 떠도 평균 0.5 손실
  // -------------------------------------------------------
  const statAnalysis = [
    {
      name: "체력",
      decimal: +(initStats.hp % 1).toFixed(4),
      display: sGrade.hp,
    },
    {
      name: "공격력",
      decimal: +(initStats.atk % 1).toFixed(4),
      display: sGrade.atk,
    },
    {
      name: "방어력",
      decimal: +(initStats.def % 1).toFixed(4),
      display: sGrade.def,
    },
    {
      name: "순발력",
      decimal: +(initStats.agi % 1).toFixed(4),
      display: sGrade.agi,
    },
  ];

  // 소수점 > 0.75 → 통수 위험 (정석잡아도 실제 약할 수 있고, -1이면 손실 큼)
  const dangerStats = statAnalysis.filter((s) => s.decimal > 0.75);
  // 소수점 < 0.2 → 매우 안전 (정석이면 진짜 S급, -1이어도 손실 적음)
  const safeStats = statAnalysis.filter((s) => s.decimal < 0.2);
  const allSafe = dangerStats.length === 0;

  // ---- 역산: 표기값 → 내부 raw 스탯 산출 ----
  const s = initStats.agi;
  const b1 = initStats.hp - s;
  const b2 = initStats.atk - s * 0.05;
  const b3 = initStats.def - s * 0.05;

  const h = (0.99 * b1 - 0.9 * b2 - 0.9 * b3) / 3.78;
  const a = (-0.09 * b1 + 3.9 * b2 - 0.3 * b3) / 3.78;
  const d = (-0.09 * b1 - 0.3 * b2 + 3.9 * b3) / 3.78;

  // 1 배분 포인트의 raw 스탯 영향량 추정 (sum_base ≈ 90 가정)
  const totalRaw = h + a + d + s;
  const onePoint = totalRaw / 108;

  // 실제 유효한 모든 S급 조합 계산 (10포인트 합=10)
  const comboSet = new Set<string>();
  for (let dh = 0; dh <= 10; dh++) {
    for (let da = 0; da <= 10 - dh; da++) {
      for (let dd = 0; dd <= 10 - dh - da; dd++) {
        const ds = 10 - dh - da - dd;
        const nh = h + (dh - 2.5) * onePoint;
        const na = a + (da - 2.5) * onePoint;
        const nd = d + (dd - 2.5) * onePoint;
        const ns = s + (ds - 2.5) * onePoint;

        const rh = Math.floor(nh * 4 + na + nd + ns);
        const ra = Math.floor(nh * 0.1 + na + nd * 0.1 + ns * 0.05);
        const rd = Math.floor(nh * 0.1 + na * 0.1 + nd + ns * 0.05);
        const rs = Math.floor(ns);
        comboSet.add(`${rh}/${ra}/${rd}/${rs}`);
      }
    }
  }

  // 보기 좋게 정렬 (공격력 우선, 그 다음 체력 우선)
  const allCombos = Array.from(comboSet).sort((a, b) => {
    const [h1, a1, d1, s1] = a.split("/").map(Number);
    const [h2, a2, d2, s2] = b.split("/").map(Number);
    if (a2 !== a1) return a2 - a1;
    if (h2 !== h1) return h2 - h1;
    if (d2 !== d1) return d2 - d1;
    return s2 - s1;
  });

  return {
    dangerStats,
    safeStats,
    allSafe,
    allCombos,
  };
};

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function PetExplorer() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [includeCategory, setIncludeCategory] = useState(false);
  const [minElements, setMinElements] = useState({
    화: 0,
    수: 0,
    지: 0,
    풍: 0,
  });
  const [mountable, setMountable] = useState<"all" | "가능" | "불가">("all");
  const [sort, setSort] = useState<SortOption>("name");

  // Growth Filters
  const [minGrowth, setMinGrowth] = useState<string>("4.0");
  const [minAtkGrowth, setMinAtkGrowth] = useState<string>("");
  const [minDefGrowth, setMinDefGrowth] = useState<string>("");
  const [minAgiGrowth, setMinAgiGrowth] = useState<string>("");
  const [minHpGrowth, setMinHpGrowth] = useState<string>("");

  // Pagination / Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(30);
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/pets.json")
      .then((res) => res.json())
      .then((data) => {
        setPets(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load pets", err);
        setLoading(false);
      });
  }, []);

  // Filter change resets visible count
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on filter change
  useEffect(() => {
    setVisibleCount(30);
  }, [
    search,
    includeCategory,
    minElements,
    mountable,
    sort,
    minGrowth,
    minAtkGrowth,
    minDefGrowth,
    minAgiGrowth,
    minHpGrowth,
  ]);

  const filteredPets = useMemo(() => {
    return pets
      .filter((pet) => {
        const searchLower = search.toLowerCase();
        if (search) {
          const nameMatch = pet.name.toLowerCase().includes(searchLower);
          const categoryMatch =
            includeCategory && pet.category.toLowerCase().includes(searchLower);
          if (!nameMatch && !categoryMatch) return false;
        }

        for (const el of ["화", "수", "지", "풍"] as const) {
          const minVal = minElements[el];
          if (minVal > 0) {
            if (!pet.stats.속성.includes(el)) return false;
            const match = pet.stats.속성.match(new RegExp(`${el}(\\d+)`));
            const val = match ? parseInt(match[1], 10) : 0;
            if (val < minVal) return false;
          }
        }

        if (mountable !== "all" && pet.stats.탑승여부 !== mountable)
          return false;

        const parseGrowth = (statStr: string) => {
          if (!statStr) return NaN;
          const match = statStr.match(/\(([\d.]+)\)/);
          return match ? parseFloat(match[1]) : NaN;
        };

        const minGrowthVal = parseFloat(minGrowth);
        if (!Number.isNaN(minGrowthVal)) {
          const growthVal = parseFloat(pet.stats.성장률);
          if (!Number.isNaN(growthVal) && growthVal < minGrowthVal)
            return false;
        }

        if (minAtkGrowth) {
          const val = parseFloat(minAtkGrowth);
          if (!Number.isNaN(val) && parseGrowth(pet.stats.공격력) < val)
            return false;
        }
        if (minDefGrowth) {
          const val = parseFloat(minDefGrowth);
          if (!Number.isNaN(val) && parseGrowth(pet.stats.방어력) < val)
            return false;
        }
        if (minAgiGrowth) {
          const val = parseFloat(minAgiGrowth);
          if (!Number.isNaN(val) && parseGrowth(pet.stats.순발력) < val)
            return false;
        }
        if (minHpGrowth) {
          const val = parseFloat(minHpGrowth);
          if (!Number.isNaN(val) && parseGrowth(pet.stats.내구력) < val)
            return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "ko-KR");
        if (sort === "growth") {
          const gA = parseFloat(a.stats.성장률);
          const gB = parseFloat(b.stats.성장률);
          return (Number.isNaN(gB) ? 0 : gB) - (Number.isNaN(gA) ? 0 : gA);
        }
        if (sort === "attack") {
          const aA = parseFloat(
            a.stats.공격력.match(/\(([\d.]+)\)/)?.[1] || a.stats.공격력,
          );
          const aB = parseFloat(
            b.stats.공격력.match(/\(([\d.]+)\)/)?.[1] || b.stats.공격력,
          );
          return (Number.isNaN(aB) ? 0 : aB) - (Number.isNaN(aA) ? 0 : aA);
        }
        return parseInt(a.id, 10) - parseInt(b.id, 10);
      });
  }, [
    pets,
    search,
    includeCategory,
    minElements,
    mountable,
    sort,
    minGrowth,
    minAtkGrowth,
    minDefGrowth,
    minAgiGrowth,
    minHpGrowth,
  ]);

  const displayedPets = useMemo(
    () => filteredPets.slice(0, visibleCount),
    [filteredPets, visibleCount],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run on pets change
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((prev) => prev + 30);
      },
      { rootMargin: "400px" },
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [displayedPets.length, loading]);

  return (
    <div className="min-h-screen bg-[#0f111a] text-white p-3 md:p-6 font-sans selection:bg-indigo-500/30">
      <div className="max-w-[100rem] mx-auto space-y-5">
        {/* Header */}
        <header className="flex flex-col lg:flex-row items-center justify-between gap-4 pb-4 border-b border-indigo-500/10">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 text-transparent bg-clip-text drop-shadow-sm">
            펫 검색기
          </h1>
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-80">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <svg
                  className="w-4 h-4 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <title>Search Icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                placeholder={
                  includeCategory
                    ? "펫 이름 또는 카테고리 검색..."
                    : "펫 이름 검색..."
                }
                className="w-full bg-[#121426] border border-indigo-500/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-indigo-300/30 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label
              htmlFor="category-toggle"
              className="flex items-center gap-2 cursor-pointer select-none shrink-0 group/cb"
            >
              <div className="relative">
                <input
                  id="category-toggle"
                  type="checkbox"
                  checked={includeCategory}
                  onChange={(e) => setIncludeCategory(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-[#121426] border border-white/10 rounded-full peer-checked:bg-indigo-500/30 peer-checked:border-indigo-500/40 transition-all duration-300 shadow-inner" />
                <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white/30 rounded-full peer-checked:translate-x-3.5 peer-checked:bg-indigo-400 transition-all duration-300 shadow-sm" />
              </div>
              <span
                className={`text-[11px] font-bold transition-colors duration-200 ${includeCategory ? "text-indigo-300" : "text-white/25"}`}
              >
                카테고리
              </span>
            </label>
          </div>
        </header>

        {/* Filters */}
        <div className="flex flex-col xl:flex-row gap-6 p-5 rounded-2xl bg-[#161827] border border-white/10 backdrop-blur-xl shadow-lg">
          {/* Element Sliders */}
          <div className="flex-[1.2] flex flex-col space-y-3 min-w-[260px]">
            <span className="text-[11px] font-bold text-indigo-300/60 uppercase tracking-widest px-1">
              최소 필수 속성치 (0~10)
            </span>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-[#0d0f1a] border border-white/10 rounded-xl p-4 shadow-inner w-full h-full">
              {(["화", "수", "지", "풍"] as const).map((el) => (
                <div key={el} className="flex flex-col justify-center gap-2">
                  <label
                    htmlFor={`range-${el}`}
                    className="flex justify-between items-center text-xs"
                  >
                    <span
                      className={`font-bold ${el === "화" ? "text-red-400" : el === "수" ? "text-blue-400" : el === "지" ? "text-green-400" : "text-yellow-400"}`}
                    >
                      {el === "화"
                        ? "🔥"
                        : el === "수"
                          ? "💧"
                          : el === "지"
                            ? "🌿"
                            : "💨"}{" "}
                      {el}
                    </span>
                    <span className="text-white/80 font-mono font-bold bg-white/5 px-2 py-0.5 rounded text-[10px]">
                      {minElements[el]}
                    </span>
                  </label>
                  <input
                    id={`range-${el}`}
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={minElements[el]}
                    onChange={(e) =>
                      setMinElements((prev) => ({
                        ...prev,
                        [el]: parseInt(e.target.value, 10),
                      }))
                    }
                    className={`w-full h-1.5 rounded-full appearance-none cursor-pointer shadow-inner focus:outline-none ${
                      el === "화"
                        ? "accent-red-500 bg-red-950/40"
                        : el === "수"
                          ? "accent-blue-500 bg-blue-950/40"
                          : el === "지"
                            ? "accent-green-500 bg-green-950/40"
                            : "accent-yellow-500 bg-yellow-950/40"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="w-px bg-white/5 hidden xl:block" />

          {/* Growth Filters */}
          <div className="flex-1 flex flex-col justify-center space-y-2 min-w-[280px]">
            <label
              htmlFor="min-growth"
              className="text-[11px] font-bold text-indigo-300/60 uppercase tracking-widest pl-1"
            >
              성장률 하한 필터
            </label>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <input
                  id="min-growth"
                  type="text"
                  value={minGrowth}
                  onChange={(e) => setMinGrowth(e.target.value)}
                  className="w-full bg-[#0d0f1a] border border-white/10 text-indigo-300 text-sm font-black rounded-xl pl-3 pr-10 py-1.5 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none shadow-inner"
                  placeholder="총 성장률 (예: 4.5)"
                />
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  <span className="text-white/20 text-[10px] font-bold">
                    총합
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  {
                    label: "공",
                    val: minAtkGrowth,
                    set: setMinAtkGrowth,
                    color: "text-rose-400",
                  },
                  {
                    label: "방",
                    val: minDefGrowth,
                    set: setMinDefGrowth,
                    color: "text-sky-400",
                  },
                  {
                    label: "순",
                    val: minAgiGrowth,
                    set: setMinAgiGrowth,
                    color: "text-emerald-400",
                  },
                  {
                    label: "내",
                    val: minHpGrowth,
                    set: setMinHpGrowth,
                    color: "text-orange-400",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col justify-center bg-[#0d0f1a] border border-white/10 rounded-lg shadow-inner overflow-hidden p-1"
                  >
                    <label
                      htmlFor={`growth-${stat.label}`}
                      className={`text-center text-[9px] font-black ${stat.color} mb-0.5 opacity-80 cursor-pointer`}
                    >
                      {stat.label}
                    </label>
                    <input
                      id={`growth-${stat.label}`}
                      type="text"
                      value={stat.val}
                      onChange={(e) => stat.set(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent text-white/90 text-[11px] text-center font-bold focus:outline-none placeholder-white/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-px bg-white/5 hidden xl:block" />

          {/* Mount & Sort */}
          <div className="flex flex-col justify-center sm:flex-row gap-4 min-w-[200px]">
            <div className="space-y-3 flex-1">
              <span className="text-[11px] font-bold text-indigo-300/60 uppercase tracking-widest pl-1">
                탑승
              </span>
              <div className="flex bg-[#05050a] p-1.5 rounded-xl border border-white/5 shadow-inner">
                {(["all", "가능", "불가"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMountable(m)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-300 ${mountable === m ? "bg-zinc-800 text-white shadow-md" : "text-indigo-200/40 hover:text-indigo-200"}`}
                  >
                    {m === "all" ? "전체" : m}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 flex-[1.2]">
              <label
                htmlFor="sort-select"
                className="text-[11px] font-bold text-indigo-300/60 uppercase tracking-widest pl-1"
              >
                정렬
              </label>
              <div className="relative">
                <select
                  id="sort-select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="bg-[#0d0f1a] border border-white/10 text-white text-[11px] font-bold rounded-xl pl-3 pr-8 py-2 block w-full focus:ring-1 focus:ring-indigo-500/50 focus:outline-none appearance-none cursor-pointer shadow-inner"
                >
                  <option value="name">이름순</option>
                  <option value="id">번호순</option>
                  <option value="growth">성장률순</option>
                  <option value="attack">공격력순</option>
                </select>
                <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                  <svg
                    className="w-3.5 h-3.5 text-indigo-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <title>Arrow Down</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status */}
        <p className="text-indigo-200/40 font-bold text-xs tracking-wide px-1">
          {loading
            ? "데이터 불러오는 중..."
            : `검색 결과: ${filteredPets.length} 마리`}
        </p>

        {/* Pet Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-40">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {displayedPets.map((pet, index) => {
                const popData = calculatePops(pet.init_stats_decimal);
                return (
                  <div
                    key={`${pet.id}-${index}`}
                    className="group relative rounded-[1rem] z-10 hover:z-50 block h-full flex-col flex cursor-pointer"
                  >
                    {/* ===== Popover Tooltip (아래로 매달림) ===== */}
                    {popData && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0 pt-3 w-64 bg-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 z-50 pointer-events-none group-hover:pointer-events-auto transform translate-y-2 group-hover:translate-y-0">
                        <div className="bg-[#12142d]/98 backdrop-blur-2xl p-4 flex flex-col items-stretch text-left space-y-2.5 rounded-2xl border border-indigo-500/40 shadow-[0_30px_60px_-10px_rgba(0,0,0,0.9)] relative">
                          {/* Arrow */}
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#12142d] border-t border-l border-indigo-500/40 transform rotate-45 z-0" />

                          {/* 안전도 판별 */}
                          <div className="text-[10px] font-bold leading-relaxed space-y-1 relative z-10">
                            {popData.allSafe ? (
                              <p className="text-emerald-400 text-center bg-emerald-900/20 py-1.5 rounded border border-emerald-500/10">
                                ✅ 모든 초기능력치가 안정적입니다
                              </p>
                            ) : (
                              popData.dangerStats.map((s) => (
                                <p
                                  key={s.name}
                                  className="text-amber-400 text-center bg-amber-900/20 py-1.5 rounded border border-amber-500/10"
                                >
                                  🎲 [{s.name}] 소수점 .
                                  {(s.decimal * 100).toFixed(0)} → 통수 주의
                                  (정석이라도 실제 약할 수 있음)
                                </p>
                              ))
                            )}
                            {popData.safeStats.length > 0 && (
                              <p className="text-emerald-400/70 text-center text-[9px] py-1">
                                🛡️{" "}
                                {popData.safeStats
                                  .map((s) => s.name)
                                  .join(", ")}{" "}
                                → 정석이면 S급 확정, -1이어도 손실 적음
                              </p>
                            )}
                          </div>

                          {/* S급 초기능력치 가능한 모든 리스트 */}
                          <div className="bg-black/60 border border-white/5 rounded-xl p-3 text-[10px] font-mono shadow-inner w-full relative z-10 flex flex-col h-40">
                            <p className="text-white/40 text-[8px] mb-2 font-bold shrink-0">
                              S/S 가능 초기능력치 리스트 (체/공/방/순)
                            </p>
                            <div className="overflow-y-auto space-y-1 custom-scrollbar pr-1">
                              {popData.allCombos.map((combo, i) => (
                                <div
                                  key={combo}
                                  className="flex items-center gap-2 py-0.5 border-b border-white/5 last:border-0"
                                >
                                  <span className="text-indigo-400 font-black w-3 text-center shrink-0 opacity-50">
                                    {i + 1}
                                  </span>
                                  <span className="text-white tracking-wider flex-1">
                                    {combo}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <style jsx global>{`
                      .custom-scrollbar::-webkit-scrollbar {
                        width: 4px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-track {
                        background: rgba(255, 255, 255, 0.02);
                        border-radius: 10px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(99, 102, 241, 0.3);
                        border-radius: 10px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(99, 102, 241, 0.5);
                      }
                    `}</style>

                    {/* ===== Pet Card Inner ===== */}
                    <a
                      href={pet.detail_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col h-full flex-1 overflow-hidden rounded-[1rem] bg-[#161827] border border-white/10 group-hover:border-indigo-500/30 transition-all duration-300 group-hover:shadow-[0_4px_15px_-5px_rgba(99,102,241,0.2)] group-hover:-translate-y-0.5"
                    >
                      {/* Mountable Icon */}
                      {pet.stats.탑승여부 === "가능" && (
                        <div className="absolute top-2.5 right-2.5 z-20 flex items-center justify-center bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-amber-500/30 group-hover:border-amber-500/60 transition-colors shadow-sm">
                          <svg
                            className="w-3.5 h-3.5 text-amber-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <title>탑승 가능</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 11s0-4 8-4 8 4 8 4l-1 5s-1 3-7 3-7-3-7-3l-1-5z"
                            />
                            <path d="M9 15v3M15 15v3" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}
                      {/* Element Badge */}
                      <div className="absolute top-2.5 left-2.5 z-20 flex items-center bg-black/50 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/5">
                        <span className="text-gray-200 font-bold text-[9px] tracking-wide">
                          {pet.stats.속성}
                        </span>
                      </div>
                      {/* Has analysis badge */}
                      {pet.init_stats_decimal && (
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center bg-indigo-500/20 backdrop-blur-md px-1.5 py-0.5 rounded border border-indigo-500/20">
                          <span className="text-indigo-300 font-bold text-[7px] tracking-wide">
                            분석
                          </span>
                        </div>
                      )}

                      <div className="p-3 pt-8 pb-2.5 flex flex-col items-center flex-1 relative z-10 w-full">
                        <div className="relative w-16 h-16 min-h-[4rem] mb-3 transition-transform duration-300 group-hover:scale-[1.05] will-change-transform">
                          <Image
                            src={`/images/${pet.local_image}`}
                            alt={pet.name}
                            width={64}
                            height={64}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                "/default-pet.png";
                            }}
                            className="w-full h-full object-contain filter drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]"
                          />
                        </div>
                        <h2 className="text-sm font-extrabold text-white/90 group-hover:text-white transition-colors tracking-tight mb-3 text-center">
                          {pet.name}
                        </h2>
                        {/* Stats Grid */}
                        <div className="w-full grid grid-cols-5 gap-0.5 mt-auto bg-black/40 p-1 rounded-lg border border-white/5 overflow-hidden">
                          {[
                            {
                              label: "공",
                              statStr: pet.stats.공격력,
                              color: "text-rose-300",
                            },
                            {
                              label: "방",
                              statStr: pet.stats.방어력,
                              color: "text-sky-300",
                            },
                            {
                              label: "순",
                              statStr: pet.stats.순발력,
                              color: "text-emerald-300",
                            },
                            {
                              label: "내",
                              statStr: pet.stats.내구력,
                              color: "text-orange-300",
                            },
                            {
                              label: "총",
                              statStr: `${pet.stats.성장률}(${pet.stats.성장률})`,
                              color: "text-indigo-300",
                            },
                          ].map((stat) => {
                            const isTotal = stat.label === "총";
                            let base = "0",
                              grw = "0.00";
                            if (stat.statStr) {
                              const parts = stat.statStr
                                .replace(")", "")
                                .split("(");
                              base = isTotal ? "전체" : parts[0];
                              grw = isTotal ? parts[0] : parts[1] || "0.00";
                            }
                            return (
                              <div
                                key={stat.label}
                                className="flex flex-col items-center justify-center py-1"
                              >
                                <span className="text-gray-500 text-[8px] font-black mb-0.5 uppercase tracking-wider">
                                  {stat.label}
                                </span>
                                <span
                                  className={`${stat.color} font-bold text-[10px] leading-tight`}
                                >
                                  {base}
                                </span>
                                <span className="text-white/50 font-semibold text-[8px] leading-none mt-0.5">
                                  +{grw}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Infinite Scroll Sentinel */}
            {visibleCount < filteredPets.length && (
              <div
                ref={observerTarget}
                className="w-full flex justify-center py-8"
              >
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500/50"></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
