---
title: "Device-Independent Neural Compression"
date: 2026-11-22T10:00:00-08:00
tags: ["Systems & Performance", "Language Models"]
featured: true
hero: "/js/tunazip.js"
heroHeight: 226
---

A few days ago Tufa Labs [tweeted](https://x.com/tufalabs/status/2123350647273631907) that they'd compressed 1 GB of Wikipedia to 105 MB, losslessly, beating other compressors like zip or xz by 2-3x. Their compressor, **tufazip**, isn't an algorithm in the usual sense. It's a 163M-parameter transformer that trains on the file as it compresses it, with an arithmetic coder turning its predictions into bits.[^tufazip]

Compressing with a neural network has one problem: the output only decodes on the machine that encoded it. Floating-point results differ from one GPU to the next, and a neural compressor is one long floating-point computation. Tufazip's launcher checks for exactly two NVIDIA B200s and exact versions of PyTorch, CUDA and cuDNN, and refuses to run otherwise. A file that only opens on one model of GPU isn't much of an archive.

Funnily enough, a few months ago, I was looking at this exact problem and turned away when I found out about this intrinsic property. But as fate would have it, I ended up coming up with a solution to [cross-device deterministic models](/posts/detllm/) for a completely different project. Now that this has come to my attention again, I decided to fix it. I forked tufazip into [tunazip](https://github.com/nathanrs/tunazip), whose files decode byte for byte on any hardware (tested on an H100, a B200, an A100, an L40S, an A10 and a T4).[^name]

<!-- hero: an H100 encodes the payload on the left. Once the file is written, a B200 decodes it twice on the right: float mode diverges at token 2 and never recovers, exact mode matches to the end. -->

## How a neural network becomes a compressor

Any model that predicts the next token can compress via **arithmetic coding**, where the whole file is encoded into a single number between 0 and 1.

The model's probabilities for the next token sum to 1, so they divide the interval from 0 to 1, each token getting an interval as wide as its probability. When the actual token comes in, keep its interval and renormalize it back to 0 to 1. Then divide that up by the probabilities for the token after it, keep the actual one, renormalize again, and so on to the end of the file. Any number inside the final interval names the whole sequence.

Since the final interval is the product of all those probabilities, a token with probability $p$ costs $-\log_2 p$ bits, which is why [a better predictor is a better compressor](/posts/gzip-lm/).

<!-- anim: arithmetic coding. The unit interval is divided by the model's probabilities, the actual token's piece is kept and renormalized, and a running bit count rises by −log₂ p at each step. -->
<figure class="post-anim"><canvas data-anim="arith-coding" style="height: 112px" role="img" aria-label="Arithmetic coding. The interval from 0 to 1 is split in proportion to the model's probabilities for each token, the interval for the actual token is kept, and the process repeats. Confident predictions keep the interval wide and cost few bits."></canvas></figure>

The decoder reverses this. It divides the interval the same way, sees which piece the number falls in, and that's the token. To divide it the same way it needs the same probabilities, which means the same model.

A compressed file is only as small as the file plus whatever it takes to decode it. For a neural compressor that would mean shipping the weights, which here are three times the size of the compressed file. So instead you ship a program that trains the model while encoding and decoding. Encoder and decoder start from the same seed, and each codes a token, trains on it, and codes the next. The decoder ends up with the same weights because it did the same training.

The recipe comes from Fabrice Bellard's [NNCP](https://bellard.org/nncp/), which held the best neural results on the [Large Text Compression Benchmark](https://www.mattmahoney.net/dc/text.html) from 2019 until tufazip.[^hutter] Tufazip used an updated transformer architecture (and added a few tricks to improve training).[^prior] In my version, I shrank the model from 163M parameters to 10M to speed up compression and decompression (at the cost of a slightly worse compression ratio).

## Why it has to be bit-exact

Neural networks run in floating point, and floating-point addition isn't associative. Different GPUs accumulate in different orders, so the same model gives probabilities that differ in the last bit from one card to the next. In a compressor that moves an interval boundary, the decoder reads a wrong token, trains on it, and is wrong for the rest of the file.

<!-- anim: one-bit divergence. Encoder and decoder each divide the interval, zoomed in on one boundary. The decoder's boundary is rounded differently, so the same coded number falls in a different piece on each row and they read different tokens. -->
<figure class="post-anim"><canvas data-anim="one-bit" style="height: 150px" role="img" aria-label="Encoder and decoder each divide the interval, zoomed in on one boundary. The decoder's boundary is rounded differently, so the same coded number falls in a different piece on each row and they read different tokens."></canvas></figure>

NNCP v1 ran on the CPU with Bellard's own math library, written to be "deterministic on every CPU and operating system". NNCP v2 moved to PyTorch and GPUs for speed, and its paper says the encoder and decoder match only on "the exact same hardware and software versions". Tufazip has the same constraint, and its launcher enforces it.

I encoded 1 MB of enwik8 on an H100 and decoded it on five other GPU types. Every one of them was wrong by the first or second token, and 99.9% of the output was garbage.[^float-fail]

## Exact arithmetic on any device

[DetLLM](/posts/detllm/) fixed this for inference by running the whole forward pass in integers. Tunazip takes a shortcut for training: keep the math in float64, but feed it values small enough that every result is exactly representable. Then nothing ever rounds, so the accumulation order can't matter.

**Round every matmul operand to 16 significant bits**, with one shared exponent per row or column. Then run the matmul in float64. A product of two 16-bit values fits in 32 bits, and summing a few thousand of them stays far below float64's 53-bit mantissa, so every product and every partial sum is exact.[^grid]

<!-- anim: exact sum. The same dot product summed left to right and right to left. In float32 the two results differ in the last digits; with 16-bit operands and float64 sums they are identical. -->
<figure class="post-anim"><canvas data-anim="exact-sum" style="height: 168px" role="img" aria-label="The same 1,024 products summed in two orders. In float32 the two results differ in their last digits. With the operands rounded to 16 bits and the sums done in float64, the two results are identical."></canvas></figure>

**Everything else is exact too.** Sums outside the matmuls run in int64, `exp` is a fixed polynomial, Adam is written out operation by operation, and random numbers come from a counter instead of the framework's generator.[^kernels]

Everything I encoded on an H100 decoded correctly on six different GPUs. CPUs should work too, but I didn't test it because of how long it would take.

| File | Decoders that restored the original bytes |
|---|---|
| 1 MB | B200, A100, L40S, A10, T4 |
| 10 MB | B200, A100 |
| 100 MB | B200 |

**It costs time, not bytes.** On 100 MB of enwik8 the exact and float runs compressed to about the same size. The exact run took around 3× longer, 18 hours against 6, and decoding takes as long as encoding since it's the same training run.

Tunazip matches NNCP v1 on enwik8 and comes within 5% of NNCP v2 with a model nearly 6× smaller.

## Conclusion

Tunazip is tufazip with the arithmetic made exact. The main result is that a file encoded on one GPU decodes byte for byte on every other GPU I tried (five generations of NVIDIA hardware) with the tradeoff of being 3× slower. There are probably many optimizations I haven't done, so treat this as an upper bound.

What I haven't done: run enwik9, so there's no direct comparison with tufazip's 105 MB; finish a full decode on a CPU; or vary the software stack, since every run used the same PyTorch and CUDA versions. The code is on [GitHub](https://github.com/nathanrs/tunazip) in case you want to mess with it!

## Citation

Please cite this work as:

```
Barry, Nathan. "Device-Independent Neural Compression".
nathan.rs (Nov 2026). https://nathan.rs/posts/tunazip.
```

Or use the BibTex citation:

```
@article{barry2026tunazip,
  title   = "Device-Independent Neural Compression",
  author  = "Barry, Nathan",
  journal = "nathan.rs",
  year    = "2026",
  month   = "Nov",
  url     = "https://nathan.rs/posts/tunazip"
}
```

[^tufazip]: Details in the [tufazip post](https://tufalabs.ai/research/tufazip). Tufazip v2: 100,958,324 bytes for enwik9 plus a 4,430,029-byte decoder, 105,388,353 total, in about 7.3 days on two B200s. zip -9 and xz give 322,591,995 and 197,331,816 on the same file. Figures from the [Large Text Compression Benchmark](https://www.mattmahoney.net/dc/text.html), where tufazip is the best entry whose only model is a neural network.

[^name]: I misread "tufa" as "tuna" for the first several minutes of reading the tufazip post, which is why I named this project tunazip.

[^float-fail]: B200: first wrong token 2, 267,844 of 268,011 wrong. A100, L40S, A10, T4: first wrong token 1, 267,911 to 267,988 wrong. The H100 decodes its own file.

[^hutter]: Not to be confused with the Hutter Prize, which uses the same file but limits entries to one CPU core, 10 GB of RAM and 50 hours. The LTCB takes any hardware and any runtime, and ranks by the compressed size plus the decompressor alone.

[^prior]: Mainly a 4.3 MB pretrained prior, which cuts the enwik9 payload by 4.7% but nets only 0.6% once the bigger decoder is counted, and a replay window grown from 15M to 35M tokens, worth 1.2% for 40% more compute. My version drops the prior.

[^kernels]: The CUDA kernels use `__dmul_rn` and `__dadd_rn` so the compiler can't fuse a multiply and an add into one differently-rounded instruction.

[^grid]: The exactness condition is that the inner dimension times $2^{b_1 + b_2}$ fits in $2^{53}$, where $b_1$ and $b_2$ are the bit widths of the two operands. At 16 and 16 bits that allows inner dimensions up to $2^{21}$.
