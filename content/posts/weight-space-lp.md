---
title: "Can a Linear Program Do Weight-Space Programming?"
date: 2026-11-09T06:17:23-08:00
tags: ["Machine Learning"]
featured: true
draft: false
hero: "/js/weight-space-lp.js"
---

Last week, MIT CSAIL published [*Sparks of Weight-Space Programming*](https://rikiyat.github.io/blog/weight-space-programming/). Given the raw weights of a small network, GPT-6 Astra could tell which game it had been trained to play. Given only a game's rules, it could write the weights of a small network from scratch and beat networks trained with PPO for 100 million steps. No gradients, no training loop, just reasoning about what the weights compute. They coined this **weight-space programming**.

In another experiment, they asked Astra to make Qwen3.5-0.8B better at math by editing its weights. Astra changed only 0.016% of the weights, and MATH-500 accuracy jumped from 7.9% to 48.1%.[^paper]

Looking at Astra's edit, I realized most of its search was solving a linear program by trial and error. It spent about 8 hours and 28 forward passes choosing which weights to change and by how much. A couple of LP solves, about a minute each, do the same job with 8× fewer changed weights. In this post I'll walk through the edit, why it's an LP, and what that says about the fix itself.



## Thinking loops

Small reasoning models have a common failure: they get stuck in **thinking loops**, repeating the same few lines over and over instead of finishing their reasoning. Qwen3.5-0.8B is especially prone to it, and its model card says so. On MATH-500, 93% of the base model's answers ran into the 32,768-token limit without ever reaching an answer.

<!-- anim: duplicate-text profile along 8 real base-model answers -->
<figure class="post-anim"><canvas data-anim="loop-trace" role="img" aria-label="Eight of the base model's answers drawn as bars along the 32,768-token budget. Most turn almost entirely to repeated text within the first thousand tokens and run to the limit; one finishes early."></canvas></figure>

The edit fixes the loops, so it helps anywhere the model loops. That includes instruction following: IFEval went from 21% to 62%.

| Qwen3.5-0.8B | MATH-500 | GSM8K | IFEval | Hit token limit |
|---|---|---|---|---|
| Base | 7.9 | 13.8 | 21.0 | 93.0% |
| Astra's edit | 48.1 | 67.1 | 62.3 | 33.1% |

On Gemma 3 270M, which rarely loops, Astra couldn't meaningfully improve its math ability. As the authors put it, editing the weights could remove an obstacle hiding an ability, but couldn't add one the model lacked.



## How Astra fixed the loops

Transformers use residual connections: each layer's output is added to its input rather than replacing it. Follow one token through the network and you get a single vector that every layer adds to, called the **residual stream** (1,024-dimensional in this model). When the model is looping, the residual stream shifts in a consistent direction. Astra's fix was to edit two layers so that what they add points the opposite way.

### Finding the loop direction

Astra wrote four pairs of short texts, each a piece of productive reasoning and a looping version of the same reasoning. It ran all eight through the model and recorded each token's residual stream vector at one layer. Averaging over the looping texts gives one vector, and averaging over the productive texts gives another. Their difference, normalized, is the **loop direction** $u$: the way the residual stream moves when the model loops.

<!-- anim: 2D projection of the residual stream. Productive tokens scatter in one region; as a trace starts looping, its tokens drift along an arrow labeled u. -->
<figure class="post-anim"><canvas data-anim="loop-direction" role="img" aria-label="Residual stream vectors of productive tokens sit in one region. As the model starts looping, its residual stream drifts along a single direction, u."></canvas></figure>

### Editing the weights

Each MLP ends with a matrix $W$ (called `down_proj`). At every token, it turns the MLP's 3,584-dimensional hidden activation $h$ into a 1,024-dimensional output $Wh$, which gets added to the residual stream $x$:

$$x \leftarrow x + Wh, \qquad Wh = \sum_j h_j \, w_j$$

So the MLP's output is always a weighted sum of the same 3,584 vectors, the columns $w_j$ of $W$. $W$ fixes what those vectors are; the activations $h_j$ decide how much of each one gets added at each token.

<!-- anim: entries of h light up with different strengths; each scales its column of W into a 1024-d vector, and the sum builds up. -->
<figure class="post-anim"><canvas data-anim="down-proj" role="img" aria-label="Each entry of the hidden activation scales its own column of W, and the scaled columns add up to the update written into the residual stream."></canvas></figure>

Each column points partly along $u$. That amount, $u^\top w_j$, is how much column $j$ pushes the model toward looping whenever $h_j$ is active. Astra's edit subtracts a multiple $\alpha$ of it:

$$w_j \to w_j - \alpha \, (u^\top w_j) \, u$$

At $\alpha = 1$ the component along $u$ is gone, so the column no longer pushes toward looping. Doing this to every column in layers 15 and 19 took accuracy from 9% to 33% on GSM8K and MATH training problems. At $\alpha = 6$ the component is flipped: a column that wrote $+a$ along $u$ now writes $-5a$, and pushes the model *away* from looping whenever it's used.

<!-- anim: one column w_j drawn as an arrow with its component along u highlighted. Slider for alpha: at 1 the component vanishes, at 6 it points the other way at 5x length. -->
<figure class="post-anim"><canvas data-anim="flip" role="img" aria-label="One column of W and its component along u. At alpha 1 the component is removed; at alpha 6 it is reversed and five times as long."></canvas></figure>

Every edited column changes by a multiple of the same vector $u$. So the whole edit is one direction $u$ plus one number per column, $v_j = -\alpha\,(u^\top w_j)$, which is zero for columns left alone. That's a **rank-1** change:

$$\Delta W = u\,v^\top$$

At each token, it adds $(v \cdot h_t)\,u$ to the residual stream: some amount of $u$, set by how active the edited columns are. No other direction changes.

That leaves $v$ to choose: which columns to edit, and how large $\alpha$ should be. Astra worked it out by trial and error, testing each edit on a fresh batch of those training problems:

| Edit on layers 15 and 19 | Accuracy |
|---|---|
| Base model | ~9% |
| Every column, α = 1 | 33% |
| Every column, α = 2 | 43% |
| Every column, α = 3 | 48% |
| Random direction (control) | 12.5% |
| Top 64 columns, α = 6 | 55% |

Pushing harder than $\alpha = 1$ helped more, and a random direction did nothing. The final edit used $\alpha = 6$ on only the 64 columns per layer that wrote the most $u$ on looping text.

### Where the time went

The paper released Astra's full logs: every tool call, every forward pass, every note it wrote to itself. Astra had a Python kernel with the weights loaded and a budget of 50 forward passes, each a batched run of the model on training problems or texts of its choosing.

<!-- anim: Astra's run as a horizontal timeline, four colored phases: find u (0:00-0:15), pick layers (to 2:20), find v (to 10:00), confirm (to 20:17, incl. outage). Pass ticks along the bar. -->
<figure class="post-anim"><canvas data-anim="timeline" role="img" aria-label="Astra's 20-hour run split into phases: 15 minutes to find the loop direction, about two hours to choose layers, about eight hours to tune the edit, and the rest confirming it."></canvas></figure>

The edit was frozen after about 10 hours, and the last 17 passes re-tested it without changing anything.[^timeline] Of those 10 hours, finding $u$ took 15 minutes. Finding $v$ took about 8 hours.



## Choosing v is a linear program

Astra was searching for a $v$ that strongly pushes looping tokens away from $u$ while barely touching productive ones. Since the push at token $t$ is $v \cdot h_t$, linear in $v$, both requirements are linear inequalities.

I labeled tokens from the base model's own traces: **looping** tokens ($R$), deep inside a loop, and **productive** tokens ($P$), well before any loop starts,[^loops] and recorded their activations $h_t$ at layers 15 and 19. Each one becomes a constraint, and the LP picks the $v$ with the smallest L1 norm $\sum_j |v_j|$:

$$
\begin{aligned}
\min_v \quad & \sum_j |v_j| \\
\text{s.t.} \quad & v \cdot h_t \le -\delta && t \in R \quad \text{(push looping tokens away from } u \text{ by at least } \delta\text{)} \\
& |v \cdot h_t| \le \varepsilon && t \in P \quad \text{(move productive tokens by at most } \varepsilon\text{)}
\end{aligned}
$$

In practice no $v$ satisfies every constraint, so each one gets a penalized slack variable.

Minimizing L1 tends to make $v$ sparse. The L1 ball is a diamond, and when you grow it until it touches the feasible region, it usually touches at a corner, where most coordinates are exactly zero. So the LP picks the columns as well as the amounts.

<!-- anim: 2D v-space. Constraint half-planes from a few tokens shade the infeasible region. An L1 diamond grows from the origin until it touches the feasible region at a corner on an axis. -->
<figure class="post-anim"><canvas data-anim="l1-corner" role="img" aria-label="Constraints from looping and productive tokens cut out a feasible region. An L1 diamond grows from the origin and first touches that region at a corner, where one coordinate is zero."></canvas></figure>

To get exactly 8 columns per layer, I kept the 8 with the largest effect and solved again with the rest fixed at zero.[^effect]

That replaces Astra's 8-hour search, including its choice of columns and $\alpha$, with a couple of LP solves. An off-the-shelf solver (HiGHS) took over 20 minutes each on these constraints, so I wrote a GPU solver (PDHG, the algorithm behind PDLP) that gets within 0.2% of its optimum in about a minute.[^pdhg]

<!-- anim: reuse the timeline; the 8-hour "find v" phase collapses into a single tick labeled with the LP solves. -->
<figure class="post-anim"><canvas data-anim="timeline-lp" role="img" aria-label="The same timeline, with the eight-hour dose search replaced by a couple of LP solves."></canvas></figure>



## Results

I tested two LP edits. Both use Astra's layers. One uses Astra's direction $u$. The other uses a **heuristic direction**: label tokens in the model's own traces as looping or productive with a simple repetition detector, then take the difference of their average residual streams. It's the same recipe Astra used, minus the hand-written texts, so no LLM is involved. I tuned the LP's settings on a separate 128-problem dev set; everything in the chart and table is on data never used for fitting or tuning.

<!-- anim: benchmark bars -->
<figure class="post-anim"><canvas data-anim="benchmarks" role="img" aria-label="Accuracy of the base model, Astra's edit, and the two LP edits on GSM8K test, MATH-500, unseen training problems and IFEval. Both LP edits land within a few points of Astra's edit."></canvas></figure>

| | Changed weights | GSM8K test | MATH-500 | IFEval |
|---|---|---|---|---|
| Base model | 0 | 14.1 | 7.0 | 22.9 |
| Astra's edit | 130,188 | 68.2 | 50.9 | 61.9 |
| LP, Astra's direction | 16,291 | 69.6 | 51.7 | 59.7 |
| LP, heuristic direction | 16,271 | 65.4 | 47.8 | 60.4 |

With Astra's direction, the LP matches Astra's edit on every benchmark, within noise, while changing 8× fewer weights. With the heuristic direction, it gets about 93% of the way there.

A few other things showed up:

- **The search mattered, and the LP replaces it.** On the dev set, reusing Astra's recipe (top 64 columns, $\alpha = 6$) on the heuristic direction without searching again scores 44.5. The LP scores 54.7.
- **Different columns, same fix.** The LP's 8 columns share only 3 (layer 15) and 1 (layer 19) with Astra's 64. Many sparse solutions work; what matters is the total push along $u.$
- **A random direction does nothing.** On the dev set, a random $u$ of the same size scores 10.2, against 10.9 for the base model.



## A steering vector does the same job

An edit can only tell a looping token apart from a productive one through its activations, and a loop isn't recognizable from them until it's well under way.[^probe] So on the dev set, asking the LP to push only on loop-like tokens did no better than pushing on every token.

The LP's 8 columns in layer 15 are active on 89% of tokens, and the push they add barely varies from token to token, so the edit is close to a constant push along $u$. A constant push doesn't need a weight edit. It can be added directly as a **steering vector**, a fixed vector added to the residual stream at every token.

The table below adds the LP edit's average push along $u$ to the unedited model at layers 15 and 19, at three strengths:

| Steering strength (× the LP edit's average push) | Dev set | MATH-500 |
|---|---|---|
| 0.5× | 51.6 | |
| 1× | 57.8 | 50.8 |
| 2× | 31.2 | |

For comparison, on the same runs: the LP edit scores 62.5 on the dev set and 53.2 on MATH-500, Astra's edit 59.4 and 50.0, the base model 10.9 and 7.0. MATH-500 here is one sample per problem.

At 1×, the steering vector recovers essentially the whole fix. The window is narrow: at 0.5× the loops come back, and at 2× they stop but the reasoning falls apart.

<!-- anim: dose slider over a reasoning trace. 0.5x: trace loops. 1x: trace finishes with \boxed{}. 2x: trace ends quickly with nonsense. -->
<figure class="post-anim"><canvas data-anim="dose" role="img" aria-label="The same problem at three steering strengths: too weak and the model loops, the right dose and it finishes, too strong and its reasoning breaks."></canvas></figure>

The only difference is delivery. The LP edit is an ordinary checkpoint; the steering vector needs extra code at inference time.



## Limitations and what's next

This is one model. The LP still relies on Astra for the layers, and the best results use Astra's direction too. The heuristic direction gets most of the way without an LLM, but not all of it.

Loops also turned out to be fixable with a constant push, so the LP's per-token constraints didn't end up mattering much. A behavior that should change some tokens and leave others alone would be a better test of them. Choosing the layers without an agent is the other open piece.

Lastly, this was only tested on removing loops. Many other behaviors, like refusal or sycophancy, can be steered by adding or removing a single direction in the residual stream.[^her] If a behavior can be steered with one direction, choosing how to build it into the weights should be the same LP, but that still needs testing.

Code, edits, and the full write-up are on [GitHub](https://github.com/nathanrs/weight-space-lp).



## Citation

Please cite this work as:

```
Barry, Nathan. "Can a Linear Program Do Weight-Space Programming?"
nathan.rs (Nov 2026). https://nathan.rs/posts/weight-space-lp.
```

Or use the BibTex citation:

```
@article{barry2026wslp,
  title   = "Can a Linear Program Do Weight-Space Programming?",
  author  = "Barry, Nathan",
  journal = "nathan.rs",
  year    = "2026",
  month   = "Nov",
  url     = "https://nathan.rs/posts/weight-space-lp"
}
```



[^paper]: Rikiya Takehi, Jayden Teoh, Alex Zhang and Omar Khattab, [*Sparks of Weight-Space Programming*](https://rikiyat.github.io/blog/weight-space-programming/), MIT CSAIL, 2026. The [logs](https://github.com/RikiyaT/lm_understand-logs) are released under CC BY 4.0, and everything about Astra's run in this post comes from them.
[^timeline]: The whole run took 158 turns and 20.3 hours, including a 4.7-hour outage. 19 requests failed and weren't charged against the budget, 15 of them during the dose search. The phase breakdown is in the [write-up](https://github.com/nathanrs/weight-space-lp/blob/main/docs/WRITEUP.md).
[^loops]: A token is a duplicate if the 16-token window ending at it already appeared earlier in the response. A loop starts at the first point after which at least 80% of the remaining tokens are duplicates. Looping tokens are duplicates 64+ tokens after that; productive tokens are 256+ tokens before it, or anywhere in a trace that finished.
[^effect]: "Largest effect" ranks columns by $|v_j| \cdot \text{std}(h_j)$, how much each one typically adds along $u$.
[^pdhg]: PDHG only needs matrix-vector products, so all the tokens fit on the GPU at once, and its L1 step returns exactly sparse $v$.
[^probe]: A linear probe on layer 15 activations spots a loop once it's under way with AUC 0.93, but only 0.73 at the point where it starts.
[^her]: Or whether you can make it [sound like her](https://x.com/jasonzhang10/status/2115447069574054323).
