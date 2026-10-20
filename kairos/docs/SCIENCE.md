# The science behind Kairos

What the product claims, what the evidence says, how confident we are, and how the forecast engine turns it into code. Confidence levels: **high** (replicated, large or hormone-verified studies), **moderate** (sound but limited studies), **low** (plausible, thin evidence).

---

## 1. The fertile window

| Claim | Evidence | Confidence |
| --- | --- | --- |
| Conception only follows intercourse in a six-day window ending on ovulation day | Wilcox, Weinberg & Baird, *NEJM* 1995: 221 women, 625 cycles, ovulation from urinary hormones. ASRM's 2021 committee opinion uses the same six-day definition | High |
| Per-act chance of conception rises across the window, from about 0.10 five days before ovulation to about 0.33 on ovulation day | Wilcox 1995 | High for the endpoints. The engine's intermediate values (0.15, 0.20, 0.26, 0.30) are a monotone interpolation we chose, used only to rank days, never quoted as probabilities |
| The window moves a lot between women and between cycles | Wilcox, Dunson & Baird, *BMJ* 2000: on every day from cycle day 6 to 21 a woman has at least a 10% chance of being in her fertile window; only ~30% of women have it entirely within days 10–17 | High |
| Real cycles are rarely 28 days | Bull et al., *npj Digital Medicine* 2019 (Natural Cycles data, 612,613 ovulatory cycles, 124,648 users): mean cycle 29.3 d; only ~13% of cycles are 28 d; mean follicular phase 16.9 d (95% range 10–30), mean luteal 12.4 d (7–17); cycle length falls ~0.18 d per year of age from 25 to 45. Funded by the app maker, self-logged data | High for the shape, moderate for exact values |
| Calendar-only apps rarely hit the ovulation day | Johnson, Marriott & Zinaman, *Curr Med Res Opin* 2018: the best calendar prediction was right for about 1 in 5 women. Industry-funded (Clearblue's maker) | Moderate |
| Intercourse every one to two days in the window maximises the chance of conception; more often does not hurt | ASRM Practice Committee, *Optimizing Natural Fertility*, 2021 (*Fertil Steril* 2022) | High |
| Seek evaluation after 12 months of trying, or 6 months if she is 35 or older | ASRM 2021; WHO definition of infertility | High |
| About 1 in 6 adults experience infertility in their lifetime (17.5%) | WHO, April 2023 | High |

## 2. Signals the engine reads

| Signal | What it tells us | Evidence | How the engine uses it |
| --- | --- | --- | --- |
| Urine LH test | The first positive test usually precedes ovulation by about a day; urinary LH can stay elevated the day after | Reviews give ~24–36 h of warning from surge onset; one ultrasound-controlled study measured 20 ± 3 h from first positive urine test to ovulation. WHO laparotomy data: 90% of ovulations within 16–48 h of the initial LH rise | Soft likelihood by days from test to ovulation (−2…+3), with a 2% false-positive rate. Negative tests push probability later |
| Basal body temperature | Progesterone raises waking temperature by roughly 0.2–0.5 °C after ovulation. Retrospective only | Classic symptothermal methods; "three over six" rule | Bayesian change-point model over every reading in the cycle (see §4). A three-over-six detector is kept only for display |
| Wrist temperature (Apple Watch Series 8+, Oura) | Same physiology, noisier signal | Apple uses nightly wrist temperature to estimate ovulation *after* it happens and improve period predictions; it publishes no accuracy figures. One public first-hand test found a several-day discrepancy | Same change-point model, with a wider ramp and wider shift prior |
| Cervical mucus | Watery or egg-white mucus is typical of the days just before ovulation | Fertility-awareness literature | Soft likelihood: fertile-quality mucus near the five days before ovulation is likely, dry mucus right before it is unlikely |
| "Her period hasn't started yet" | Rules out early ovulation | Follows from the luteal phase being relatively stable | Conditioning term P(luteal > today − k) |
| Positive pregnancy test | | | Pauses sharing (product rule) |

## 3. Desire, mood and the seasons

| Claim | Evidence | Confidence |
| --- | --- | --- |
| Intercourse is more frequent in the six fertile days, even without tracking | Wilcox et al., *Hum Reprod* 2004: 68 women, hormone-verified ovulation; intercourse ~24% more frequent on fertile days than other non-bleeding days, peaking at ovulation. The study did not measure libido directly | Moderate–high |
| For many women desire is responsive: it can follow arousal and intimacy rather than precede them; context and emotional connection matter | Basson, *J Sex Marital Ther* 2000; 2002 follow-up | Moderate (influential model; varies by person) |
| Mood changes are tied to the premenstrual phase for everyone | **Weak.** Romans et al., *Gender Medicine* 2012, reviewed 47 prospective studies: 38% found no association of mood with any phase, only ~15% found negative mood confined to the premenstrual phase. PMS and PMDD are real for a subset; the universal stereotype is not | Low for the stereotype |
| Doing new, exciting things together improves relationship quality | Aron et al., *JPSP* 2000: surveys plus three experiments; a 7-minute novel, arousing task raised experienced relationship quality versus a mundane one | Moderate |
| People have one "love language" and couples do best when partners speak it | **Not supported.** Impett, Park & Muise, *Curr Dir Psychol Sci* 2024, reviewed the evidence and found little support for Chapman's three central claims; they suggest a "balanced diet" of needs instead | Low for the theory |
| Sustained heat (hot tubs, saunas) can lower sperm production and motility, reversibly | Small studies (UCSF pilot 2007; sauna studies); recovery after one to two spermatogenic cycles, i.e. months | Moderate (small samples) |

**What this means for the product.** Seasons are tendencies, written as such, and her signals always override them. Kairos weights six "ingredients" (presence, words, service, small gifts, touch, new experiences) by what she says matters to her, as a balanced diet rather than a single language. Romance ideas never ask for an outcome. Novel shared experiences are favoured in spring and summer, when energy tends to be higher, but appear across the cycle.

---

## 4. The forecast engine

Source: `packages/core/src/cycle/`.

**Personal statistics (`history.ts`).** Cycle lengths, period lengths and (where sensors located ovulation in past cycles) luteal lengths are recency-weighted (×0.85 per older cycle) and shrunk toward population priors: cycle 29.3 ± 3.0 d, luteal 12.4 ± 1.8 d, period 5 d. Her stated cycle length counts as two cycles of evidence until real cycles exist. Logs closer than 10 days are merged as spotting; cycles outside 15–60 days are treated as missed logs and ignored.

**Ovulation posterior (`ovulation.ts`).** A discrete distribution over days since her period started. The prior is Normal(cycle − luteal, √(Var(cycle) − Var(luteal))), because cycle = follicular + luteal. It is multiplied by:

- P(period not started by today | ovulation on day k);
- one soft likelihood per LH test and per mucus observation;
- a temperature change-point likelihood: for each candidate day k, temperatures are modelled as `baseline + Δ·ramp(day − k) + noise`, with the baseline profiled out, Δ integrated analytically over a Normal(0.3 °C, 0.1–0.12) prior, and noise estimated from her own day-to-day variation (median absolute difference). Candidates whose step would fall after the last reading reduce exactly to the no-shift model, which is the right "no rise yet" evidence. The likelihood is tempered (power 0.6) to stay humble about outliers.

The point estimate is the ovulation day whose six-day window holds the most fertile probability (better than the mode when the posterior is wide). "Confirmed" requires the mode to be at least two days past, ±1-day mass ≥ 0.75, and post-ovulatory evidence.

**Forecast (`forecast.ts`).** 1,500 seeded Monte Carlo futures sample this cycle's ovulation from the posterior, a luteal length conditioned on her period not having started yet, and then later cycles from her personal statistics. Each day gets P(fertile), P(bleeding), P(each season) and a relative conception weight. A separate point timeline gives each day one coherent season so the UI never flickers. The same seed on both phones gives the same future. A forecast takes ~10–30 ms.

## 5. How accurate is it?

`npm run bench` simulates women whose cycle statistics vary realistically between and within women, generates noisy sensor data (LH kits that miss and misfire, thermometers with outliers, watches that skip nights, mucus noted on 60% of days), gives the engine six cycles of history, and scores three more cycles in real time: each morning it sees only what she would have logged by then. The truth generator deliberately differs from the model's likelihoods.

400 simulated women × 3 cycles:

| Data | Ovulation day, predicted on day 1: exact | ±1 day | ±2 days | Fertile days flagged that morning | Flag precision | Both best days flagged | Ovulation located ±1 day by 5 days after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Calendar only | 14% | 37% | 59% | 60% | 63% | 57% | 37% |
| + cervical mucus | 14% | 37% | 59% | 72% | 72% | 71% | 71% |
| + wrist temperature | 14% | 39% | 61% | 64% | 65% | 61% | 61% |
| + BBT thermometer | 14% | 40% | 61% | 68% | 69% | 68% | 80% |
| + LH tests | 14% | 40% | 62% | 74% | 76% | 80% | 89% |
| + LH + mucus | 14% | 40% | 63% | 81% | 79% | 89% | 95% |
| + LH + wrist temp | 14% | 40% | 62% | 74% | 76% | 82% | 92% |
| Everything | 15% | 41% | 63% | 83% | 80% | 90% | 98% |

How to read it:

- **On day 1 of a cycle, nothing beats the calendar by much.** Sensors cannot see this cycle's ovulation yet. The 14% exact-day figure is in line with published calendar-app studies, which is a useful sanity check on the simulator.
- **In real time, sensors matter most where they matter most to him: the two best days.** Calendar alone flags both on the morning they happen 57% of the time; LH tests raise that to 80%, LH plus mucus to 89%.
- **Temperature is retrospective.** It barely helps him in advance, but it pins down where ovulation happened, which teaches the engine her luteal length and sharpens every future cycle.

**Limits.** These are simulations under stated assumptions, not clinical validation. Real data has messier logging, anovulatory cycles, PCOS, postpartum and perimenopausal irregularity, and hormonal contraception (which removes the cycle altogether; the app should ask). A real accuracy claim needs a prospective study against ultrasound or urinary hormone metabolites.

---

## 6. What Kairos is not

- **Not contraception.** Natural Cycles (FDA De Novo, August 2018; ~93% effective with typical use) and Clue Birth Control (FDA 510(k), 2021) went through regulatory clearance to make that claim. Kairos makes no such claim and says so wherever fertility is shown outside "trying".
- **Not a diagnosis.** It nudges couples toward a clinician at 12 months of trying (6 if 35+), and should when cycles are persistently shorter than 21 or longer than 35 days.
- **Not a mood predictor.** Seasons describe tendencies; signals describe Tuesday.

## References

- Aron A, Norman CC, Aron EN, McKenna C, Heyman RE. Couples' shared participation in novel and arousing activities and experienced relationship quality. *J Pers Soc Psychol* 2000;78(2):273–284.
- ASRM Practice Committee. Optimizing natural fertility: a committee opinion. *Fertil Steril* 2022 (2021 opinion).
- Basson R. The female sexual response: a different model. *J Sex Marital Ther* 2000;26(1):51–65.
- Bull JR et al. Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles. *npj Digit Med* 2019;2:83.
- GBD 2021 Fertility and Forecasting Collaborators. Global fertility in 204 countries and territories, 1950–2021, with forecasts to 2100. *Lancet* 2024;403:2057–2099.
- Impett EA, Park HG, Muise A. Popular psychology through a scientific lens: evaluating love languages from a relationship science perspective. *Curr Dir Psychol Sci* 2024.
- Johnson S, Marriott L, Zinaman M. Can apps and calendar methods predict ovulation with accuracy? *Curr Med Res Opin* 2018;34(9):1587–1594.
- Pope A, Hugo Wurlitzer S. *Wild Power*. Hay House, 2017.
- Romans S et al. Mood and the menstrual cycle: a review of prospective data studies. *Gend Med* 2012;9(5):361–384.
- Wilcox AJ, Weinberg CR, Baird DD. Timing of sexual intercourse in relation to ovulation. *N Engl J Med* 1995;333:1517–1521.
- Wilcox AJ, Dunson D, Baird DD. The timing of the "fertile window" in the menstrual cycle: day specific estimates from a prospective study. *BMJ* 2000;321:1259–1262.
- Wilcox AJ et al. On the frequency of intercourse around ovulation: evidence for biological influences. *Hum Reprod* 2004;19(7):1539–1543.
- World Health Organization. Infertility prevalence estimates, 1990–2021. April 2023.
