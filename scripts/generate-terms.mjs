// -----------------------------------------------------------------------------
//  Terms → dictionary/ folder generator
//
//  Run:  node scripts/generate-terms.mjs
//
//  Each entry below is written as its own JSON file under the matching
//  letter-range folder (a-b, c-d, … y-z). The JSON files in /dictionary are the
//  source of truth consumed by the web app — edit them directly to change a
//  word, or add new entries here and re-run to regenerate.
// -----------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Folder per starting letter  (a-b, c-d, e-f, g-h, i-j, k-l, m-n, o-p, q-r, s-t, u-v, w-x, y-z)
const RANGES = [];
for (let code = 65; code <= 90; code += 2) {
  const a = String.fromCharCode(code);
  const b = String.fromCharCode(code + 1);
  RANGES.push(`${a.toLowerCase()}-${b.toLowerCase()}`);
}
const folderFor = (letter) => RANGES[Math.floor((letter.charCodeAt(0) - 65) / 2)];

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// -----------------------------------------------------------------------------
//  ENTRIES  (term content + citations)
// -----------------------------------------------------------------------------
const ENTRIES = [
  // ------------------------------------------------------------- A – B
  {
    term: 'Attention',
    letter: 'A',
    category: 'Architecture',
    aka: ['Self-attention', 'Scaled dot-product attention'],
    definition:
      'A mechanism that lets a model weigh how relevant every other token is when computing a representation of the current token.',
    details:
      'In the Transformer, each token produces a query, key and value vector; attention scores are the dot products of queries with keys, scaled and normalized with a softmax, then used to blend the values. Multi-head attention runs this several times in parallel so the model can attend to different relationships at once. It is the core of modern LLMs such as GPT and BERT.',
    citation: {
      title: 'Attention Is All You Need',
      authors: ['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.', 'Uszkoreit, J.', 'Jones, L.', 'Gomez, A. N.', 'Kaiser, L.', 'Polosukhin, I.'],
      year: 2017,
      venue: 'Advances in Neural Information Processing Systems 30 (NeurIPS)',
      url: 'https://arxiv.org/abs/1706.03762',
    },
  },
  {
    term: 'AI Agent',
    letter: 'A',
    category: 'Agents',
    aka: ['LLM agent', 'Autonomous agent'],
    definition:
      'A system in which a language model repeatedly reasons about a goal, chooses an action (such as a tool call or search), and observes the result.',
    details:
      'Agents pair a model with a loop of perception, reasoning and action so it can complete multi-step tasks rather than producing a single answer. ReAct interleaves “reasoning traces” with actions and observations, which improves factuality and lets models answer and act in one framework. Agent frameworks commonly add memory, planning and a set of tools the model can invoke.',
    citation: {
      title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
      authors: ['Yao, S.', 'Zhao, J.', 'Yu, D.', 'Du, N.', 'Shafran, I.', 'Narasimhan, K.', 'Cao, Y.'],
      year: 2022,
      venue: 'arXiv preprint',
      url: 'https://arxiv.org/abs/2210.03629',
    },
  },
  {
    term: 'Artificial Intelligence',
    letter: 'A',
    category: 'Foundations',
    aka: ['AI'],
    definition:
      'The field of making machines perform tasks that normally require human intelligence, such as reasoning, perception and language.',
    details:
      'The term was coined for the 1956 Dartmouth Summer Research Project, which proposed that “every aspect of learning or any other feature of intelligence can in principle be so precisely described that a machine can be made to simulate it.” Modern AI is dominated by machine learning, and deep learning in particular, which learns patterns from data instead of relying on hand-written rules.',
    citation: {
      title: 'A Proposal for the Dartmouth Summer Research Project on Artificial Intelligence',
      authors: ['McCarthy, J.', 'Minsky, M. L.', 'Rochester, N.', 'Shannon, C. E.'],
      year: 1955,
      venue: 'Stanford University archives',
      url: 'http://jmc.stanford.edu/articles/dartmouth/dartmouth.pdf',
    },
  },
  {
    term: 'Backpropagation',
    letter: 'B',
    category: 'Training',
    aka: ['Backprop'],
    definition:
      'The algorithm that computes how much each weight contributed to the error by applying the chain rule backwards through the network.',
    details:
      'Backpropagation propagates the gradient of the loss from the output layer back to the input layer, letting gradient descent update every weight efficiently. It made training multilayer neural networks practical and is used, in one form or another, by virtually every deep-learning optimizer today.',
    citation: {
      title: 'Learning representations by back-propagating errors',
      authors: ['Rumelhart, D. E.', 'Hinton, G. E.', 'Williams, R. J.'],
      year: 1986,
      venue: 'Nature 323, 533–536',
      url: 'https://doi.org/10.1038/323533a0',
    },
  },
  {
    term: 'BERT',
    letter: 'B',
    category: 'Architecture',
    aka: ['Bidirectional Encoder Representations from Transformers'],
    definition:
      'A Transformer encoder pre-trained on masked language modeling that produced state-of-the-art contextual word representations.',
    details:
      'BERT randomly masks tokens in unlabeled text and learns to predict them while attending to words on both sides, giving genuinely bidirectional context. After pre-training, a single BERT model can be fine-tuned to excel on many tasks, from question answering to sentiment analysis, without task-specific architectures.',
    citation: {
      title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
      authors: ['Devlin, J.', 'Chang, M.-W.', 'Lee, K.', 'Toutanova, K.'],
      year: 2019,
      venue: 'Proceedings of NAACL-HLT',
      url: 'https://arxiv.org/abs/1810.04805',
    },
  },
  {
    term: 'Byte-Pair Encoding',
    letter: 'B',
    category: 'Tokenization',
    aka: ['BPE'],
    definition:
      'A subword tokenization method that iteratively merges the most frequent pair of symbols into a single token.',
    details:
      'BPE starts with individual characters and repeatedly merges the most common adjacent pair, building a fixed-size vocabulary of character fragments. This lets a model handle rare and out-of-vocabulary words as sequences of known subwords, which is far more robust than whole-word vocabularies for morphologically rich languages.',
    citation: {
      title: 'Neural Machine Translation of Rare Words with Subword Units',
      authors: ['Sennrich, R.', 'Haddow, B.', 'Birch, A.'],
      year: 2016,
      venue: 'Proceedings of ACL',
      url: 'https://arxiv.org/abs/1508.07909',
    },
  },

  // ------------------------------------------------------------- C – D
  {
    term: 'Chain-of-Thought',
    letter: 'C',
    category: 'Prompting',
    aka: ['CoT prompting'],
    definition:
      'Prompting a model to “think step by step” by showing intermediate reasoning, which markedly improves performance on arithmetic and logic.',
    details:
      'Chain-of-thought prompting appends a few worked examples that contain explicit reasoning steps, or simply asks the model to reason before answering. It unlocks substantial gains on tasks where a single leap to the answer fails, and is one of the simplest high-impact prompting techniques for large models.',
    citation: {
      title: 'Chain-of-Thought Prompting Elicits Reasoning in Large Language Models',
      authors: ['Wei, J.', 'Wang, X.', 'Schuurmans, D.', 'Bosma, M.', 'Ichter, B.', 'Xia, F.', 'Chi, E.', 'Le, Q. V.', 'Zhou, D.'],
      year: 2022,
      venue: 'Advances in Neural Information Processing Systems 35 (NeurIPS)',
      url: 'https://arxiv.org/abs/2201.11903',
    },
  },
  {
    term: 'Convolutional Neural Network',
    letter: 'C',
    category: 'Architecture',
    aka: ['CNN', 'ConvNet'],
    definition:
      'A neural network that uses learned filters sliding over its input, especially effective for images and other grid data.',
    details:
      'Convolutions share weights across spatial locations and build hierarchical features, from edges in early layers to whole objects in later ones. LeNet demonstrated the approach on handwritten digits, and deeper CNNs powered the modern computer-vision revolution. They remain central in vision pipelines even as Transformers gain ground.',
    citation: {
      title: 'Gradient-Based Learning Applied to Document Recognition',
      authors: ['LeCun, Y.', 'Bottou, L.', 'Bengio, Y.', 'Haffner, P.'],
      year: 1998,
      venue: 'Proceedings of the IEEE 86(11)',
      url: 'https://ieeexplore.ieee.org/document/726791',
    },
  },
  {
    term: 'Context Window',
    letter: 'C',
    category: 'LLM Concepts',
    aka: ['Context length', 'Sequence length'],
    definition:
      'The maximum number of tokens a model can attend to at once when generating or processing text.',
    details:
      'The context window bounds the prompt plus generated output a model can handle in a single pass. Performance is not uniform across the window: models often best use information at the very beginning or end of long contexts and can “lose” facts placed in the middle, a finding emphasized in the “lost in the middle” study.',
    citation: {
      title: 'Lost in the Middle: How Language Models Use Long Contexts',
      authors: ['Liu, N. F.', 'Lin, K.', 'Hewitt, J.', 'Paranjape, A.', 'Beemelmanns, M.', 'Petroni, F.', 'Liang, P.'],
      year: 2024,
      venue: 'Transactions of the Association for Computational Linguistics',
      url: 'https://arxiv.org/abs/2307.03172',
    },
  },
  {
    term: 'Deep Learning',
    letter: 'D',
    category: 'Foundations',
    aka: ['Deep neural networks'],
    definition:
      'Machine learning with multi-layer neural networks that learn hierarchical representations from raw data.',
    details:
      'By stacking many layers, deep networks compose simple features into increasingly abstract ones — edges into parts, parts into objects — with the representations learned from data rather than engineered. Combined with large datasets and fast GPUs, this approach reset the state of the art across speech, vision, translation and games.',
    citation: {
      title: 'Deep learning',
      authors: ['LeCun, Y.', 'Bengio, Y.', 'Hinton, G.'],
      year: 2015,
      venue: 'Nature 521, 436–444',
      url: 'https://doi.org/10.1038/nature14539',
    },
  },
  {
    term: 'Diffusion Model',
    letter: 'D',
    category: 'Generative Models',
    aka: ['Denoising diffusion probabilistic model', 'DDPM'],
    definition:
      'A generative model trained to reverse a process that gradually adds noise to data, thereby learning to create new data from noise.',
    details:
      'Training adds Gaussian noise over many steps until an image becomes pure noise, and the network learns to predict and remove the noise at each step. Sampling then starts from random noise and denoises it step by step. Diffusion models power modern text-to-image systems such as DALL·E, Stable Diffusion and Midjourney.',
    citation: {
      title: 'Denoising Diffusion Probabilistic Models',
      authors: ['Ho, J.', 'Jain, A.', 'Abbeel, P.'],
      year: 2020,
      venue: 'Advances in Neural Information Processing Systems 33 (NeurIPS)',
      url: 'https://arxiv.org/abs/2006.11239',
    },
  },

  // ------------------------------------------------------------- E – F
  {
    term: 'Embedding',
    letter: 'E',
    category: 'Representations',
    aka: ['Vector embedding', 'Word embedding'],
    definition:
      'A dense vector of numbers that represents a word, sentence or object in a space where similar meanings are close together.',
    details:
      'Embeddings map discrete symbols into continuous vector spaces learned from co-occurrence and context statistics. Words with similar meanings end up near each other, and directions in the space can encode relationships (such as analogies). Modern systems embed tokens inside the network and embed whole texts as a single vector for search and retrieval.',
    citation: {
      title: 'Distributed Representations of Words and Phrases and their Compositionality',
      authors: ['Mikolov, T.', 'Sutskever, I.', 'Chen, K.', 'Corrado, G.', 'Dean, J.'],
      year: 2013,
      venue: 'Advances in Neural Information Processing Systems 26 (NeurIPS)',
      url: 'https://arxiv.org/abs/1310.4546',
    },
  },
  {
    term: 'Emergent Abilities',
    letter: 'E',
    category: 'LLM Concepts',
    aka: ['Emergence'],
    definition:
      'Capabilities that are not present in smaller models but appear suddenly once a model passes a scale threshold.',
    details:
      'Certain abilities — such as multi-step arithmetic, following instructions in a new format, or code generation — seem nearly absent at small scale and then jump sharply at larger scale. This phenomenon matters for scaling laws and for deciding what a model can be expected to do, though some apparent “emergence” is partly a measurement artifact tied to metric choice.',
    citation: {
      title: 'Emergent Abilities of Large Language Models',
      authors: ['Wei, J.', 'Tay, Y.', 'Bommasani, R.', 'Raffel, C.', 'Zoph, B.', 'Borgeaud, S.', 'Yogatama, D.', 'Bosma, M.', 'Zhou, D.', 'Metzler, D.', 'Chi, E. H.', 'Hashimoto, T.', 'Vinyals, O.', 'Liang, P.', 'Dean, J.', 'Fedus, W.'],
      year: 2022,
      venue: 'Transactions on Machine Learning Research',
      url: 'https://arxiv.org/abs/2206.07682',
    },
  },
  {
    term: 'Few-Shot Learning',
    letter: 'F',
    category: 'In-Context Learning',
    aka: ['Few-shot prompting', 'K-shot learning'],
    definition:
      'Using a handful of examples inside the prompt to teach a model a task, without updating its weights.',
    details:
      'GPT-3 showed that scaling alone lets a language model learn a new task from just a few demonstrations supplied as input. Few-shot examples condition the model to the desired format and behavior and remain a workhorse technique for steering models cheaply before resorting to fine-tuning.',
    citation: {
      title: 'Language Models are Few-Shot Learners',
      authors: ['Brown, T. B.', 'Mann, B.', 'Ryder, N.', 'Subbiah, M.', 'Kaplan, J.', 'Dhariwal, P.', 'Neelakantan, A.', 'Shyam, P.', 'Sastry, G.', 'Askell, A.', 'Agarwal, S.', 'Herbert-Voss, A.', 'Krueger, G.', 'Henighan, T.', 'Child, R.', 'Ramesh, A.', 'Ziegler, D. M.', 'Wu, J.', 'Winter, C.', 'Hesse, C.', 'Chen, M.', 'Sigler, E.', 'Litwin, M.', 'Gray, S.', 'Chess, B.', 'Clark, J.', 'Berner, C.', 'McCandlish, S.', 'Radford, A.', 'Sutskever, I.', 'Amodei, D.'],
      year: 2020,
      venue: 'Advances in Neural Information Processing Systems 33 (NeurIPS)',
      url: 'https://arxiv.org/abs/2005.14165',
    },
  },
  {
    term: 'Fine-Tuning',
    letter: 'F',
    category: 'Training',
    aka: ['Fine-tuning', 'Transfer learning via fine-tuning'],
    definition:
      'Continuing to train a pre-trained model on a smaller, task-specific dataset so it adapts to a target domain.',
    details:
      'Fine-tuning exploits features learned during pre-training and adapts them to a new task with far less data than training from scratch. The ULMFiT recipe showed that a language-model “head” trained on a corpus could be fine-tuned layer by layer for text classification, and this pattern — pre-train broadly, fine-tune narrowly — underlies most applied NLP.',
    citation: {
      title: 'Universal Language Model Fine-tuning for Text Classification',
      authors: ['Howard, J.', 'Ruder, S.'],
      year: 2018,
      venue: 'Proceedings of ACL',
      url: 'https://arxiv.org/abs/1801.06146',
    },
  },
  {
    term: 'Foundation Model',
    letter: 'F',
    category: 'LLM Concepts',
    aka: ['Base model', 'Large pre-trained model'],
    definition:
      'A very large model trained on broad data at scale that can be adapted to many downstream tasks and domains.',
    details:
      'The Stanford “foundation models” report coined the term to describe models trained on broad data with massive scale, whose emergent capabilities are then steered by fine-tuning, prompting or adapters. They function as a shared substrate that many applications build upon, raising both opportunities (few-shot learning, transfer) and risks (bias, misuse, environmental cost).',
    citation: {
      title: 'On the Opportunities and Risks of Foundation Models',
      authors: ['Bommasani, R.', 'Hudson, D. A.', 'Adeli, E.', 'Altman, R.', 'Arora, S.', 'von Arx, S.', 'Bernstein, M. S.', 'et al.'],
      year: 2021,
      venue: 'arXiv preprint',
      url: 'https://arxiv.org/abs/2108.07258',
    },
  },

  // ------------------------------------------------------------- G – H
  {
    term: 'Generative Adversarial Network',
    letter: 'G',
    category: 'Generative Models',
    aka: ['GAN'],
    definition:
      'Two networks — a generator and a discriminator — trained in opposition so the generator learns to create realistic data.',
    details:
      'The generator tries to fool the discriminator into believing its outputs are real, while the discriminator learns to tell real from fake; the competition drives both to improve. GANs produced startlingly realistic images and remain important in the history of generative models, although diffusion models have since become the dominant image approach.',
    citation: {
      title: 'Generative Adversarial Nets',
      authors: ['Goodfellow, I.', 'Pouget-Abadie, J.', 'Mirza, M.', 'Xu, B.', 'Warde-Farley, D.', 'Ozair, S.', 'Courville, A.', 'Bengio, Y.'],
      year: 2014,
      venue: 'Advances in Neural Information Processing Systems 27 (NeurIPS)',
      url: 'https://arxiv.org/abs/1406.2661',
    },
  },
  {
    term: 'GPT',
    letter: 'G',
    category: 'Architecture',
    aka: ['Generative Pre-trained Transformer'],
    definition:
      'The family of decoder-only Transformer language models introduced by OpenAI that generate text left to right.',
    details:
      'GPT established the recipe that dominates modern LLMs: pre-train an autoregressive Transformer on a large corpus to predict the next token, then adapt it. The original paper showed that generative pre-training plus discriminative fine-tuning beat prior task-specific models; later generations (GPT-2, GPT-3, GPT-4) scaled the same idea into chat assistants and tool-using agents.',
    citation: {
      title: 'Improving Language Understanding by Generative Pre-Training',
      authors: ['Radford, A.', 'Narasimhan, K.', 'Salimans, T.', 'Sutskever, I.'],
      year: 2018,
      venue: 'OpenAI technical report',
      url: 'https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf',
    },
  },
  {
    term: 'Gradient Descent',
    letter: 'G',
    category: 'Optimization',
    aka: ['Steepest descent'],
    definition:
      'An iterative optimization method that moves parameters in the direction that most decreases the loss.',
    details:
      'Gradient descent computes the derivative of the loss with respect to each parameter and steps against it, scaled by a learning rate. Its stochastic variants (SGD and its many descendants such as Adam) estimate the gradient from small batches of data, which is how virtually all neural networks are trained. The method traces back to the classic work on stochastic approximation.',
    citation: {
      title: 'A Stochastic Approximation Method',
      authors: ['Robbins, H.', 'Monro, S.'],
      year: 1951,
      venue: 'The Annals of Mathematical Statistics 22(3), 400–407',
      url: 'https://doi.org/10.1214/aoms/1177729586',
    },
  },
  {
    term: 'Hallucination',
    letter: 'H',
    category: 'LLM Concepts',
    aka: ['Confabulation', 'Fabrication'],
    definition:
      'Generated content that is fluent and plausible but factually wrong or unsupported by the source material.',
    details:
      'Hallucination arises when a model confidently produces text not grounded in retrieved evidence or its training data. It is one of the most consequential failure modes of LLMs, especially in medicine, law and journalism. A broad survey of the area organizes the causes and effects and surveys detection and mitigation strategies such as retrieval grounding and verification.',
    citation: {
      title: 'Survey of Hallucination in Natural Language Generation',
      authors: ['Ji, Z.', 'Lee, N.', 'Frieske, R.', 'Yu, T.', 'Su, D.', 'Xu, Y.', 'Ishii, E.', 'Bang, Y. J.', 'Madotto, A.', 'Fung, P.'],
      year: 2023,
      venue: 'ACM Computing Surveys 55(12)',
      url: 'https://arxiv.org/abs/2202.03629',
    },
  },

  // ------------------------------------------------------------- I – J
  {
    term: 'In-Context Learning',
    letter: 'I',
    category: 'In-Context Learning',
    aka: ['ICL'],
    definition:
      'Learning a task from examples or instructions placed in the prompt, with no parameter updates.',
    details:
      'In-context learning was highlighted by GPT-3: at sufficient scale, models infer the pattern from demonstrations supplied in the input and apply it to new queries. It subsumes zero-shot, one-shot and few-shot prompting and is the basis of “prompt engineering” as a practical discipline.',
    citation: {
      title: 'Language Models are Few-Shot Learners',
      authors: ['Brown, T. B.', 'et al.'],
      year: 2020,
      venue: 'Advances in Neural Information Processing Systems 33 (NeurIPS)',
      url: 'https://arxiv.org/abs/2005.14165',
    },
  },
  {
    term: 'Instruction Tuning',
    letter: 'I',
    category: 'Training',
    aka: ['Instruction following', 'Supervised fine-tuning (SFT)'],
    definition:
      'Fine-tuning a model on (instruction, response) pairs so it follows natural-language requests reliably.',
    details:
      'Instruction tuning turns raw text models into assistants by training them on diverse human instructions and expected responses. FLAN showed that fine-tuning across many tasks phrased as instructions lets a model answer unseen tasks in zero-shot form, a step that foreshadowed the assistant behavior of later chat models.',
    citation: {
      title: 'Finetuned Language Models Are Zero-Shot Learners',
      authors: ['Wei, J.', 'Bosma, M.', 'Zhao, V. Y.', 'Guu, K.', 'Yu, A. W.', 'Lester, B.', 'Du, N.', 'Dai, A. M.', 'Le, Q. V.'],
      year: 2022,
      venue: 'International Conference on Learning Representations (ICLR)',
      url: 'https://arxiv.org/abs/2109.01652',
    },
  },
  {
    term: 'Jailbreak',
    letter: 'J',
    category: 'Safety',
    aka: ['Prompt jailbreak'],
    definition:
      'A crafted prompt that bypasses a model’s safety training to elicit disallowed or harmful behavior.',
    details:
      'Jailbreaks exploit the fact that safety alignment is often shallow and can be overridden by cleverly framed requests — role plays, hypotheticals, or encoding tricks. A widely cited analysis shows that safety-trained models can be jailbroken by techniques that are incompatible with the model’s training objective, indicating that alignment failures are systemic rather than isolated bugs.',
    citation: {
      title: 'Jailbroken: How Does LLM Safety Training Fail?',
      authors: ['Wei, A.', 'Haghtalab, N.', 'Steinhardt, J.'],
      year: 2023,
      venue: 'Advances in Neural Information Processing Systems 36 (NeurIPS)',
      url: 'https://arxiv.org/abs/2307.02483',
    },
  },

  // ------------------------------------------------------------- K – L
  {
    term: 'Knowledge Distillation',
    letter: 'K',
    category: 'Compression',
    aka: ['Distillation'],
    definition:
      'Training a smaller “student” model to imitate the predictions of a larger “teacher” model.',
    details:
      'The student learns from the teacher’s soft probability outputs rather than only hard labels, which carries richer information about similarities between classes. Distillation is a standard way to compress huge models into deployable ones while preserving much of their accuracy.',
    citation: {
      title: 'Distilling the Knowledge in a Neural Network',
      authors: ['Hinton, G.', 'Vinyals, O.', 'Dean, J.'],
      year: 2015,
      venue: 'arXiv preprint',
      url: 'https://arxiv.org/abs/1503.02531',
    },
  },
  {
    term: 'KV Cache',
    letter: 'K',
    category: 'Inference',
    aka: ['Key-value cache'],
    definition:
      'Storing the key and value vectors of past tokens so autoregressive generation need not recompute them each step.',
    details:
      'When a decoder generates token by token, earlier tokens’ attention keys and values do not change, so caching them turns each new step into an O(sequence) operation instead of recomputing the whole history. The cache grows with context length and can dominate memory, motivating techniques such as paged attention, which manages cache blocks like memory pages for higher utilization.',
    citation: {
      title: 'Efficient Memory Management for Large Language Model Serving with PagedAttention',
      authors: ['Kwon, W.', 'Li, Z.', 'Zhuang, S.', 'Sheng, Y.', 'Zheng, L.', 'Yu, C. H.', 'Gonzalez, J.', 'Zhang, H.', 'Stoica, I.'],
      year: 2023,
      venue: 'Proceedings of SOSP',
      url: 'https://arxiv.org/abs/2309.06180',
    },
  },
  {
    term: 'Large Language Model',
    letter: 'L',
    category: 'LLM Concepts',
    aka: ['LLM'],
    definition:
      'A very large neural network, typically a Transformer, trained on massive text to predict and generate language.',
    details:
      'LLMs learn statistical patterns of language and code from enormous corpora, and at scale display abilities such as instruction following, reasoning and tool use. A survey of the field maps their architecture, training, adaptation and evaluation, and describes the tuning, alignment and prompting techniques that turn a text predictor into an assistant.',
    citation: {
      title: 'A Survey of Large Language Models',
      authors: ['Zhao, W. X.', 'Zhou, K.', 'Li, J.', 'Tang, T.', 'Wang, X.', 'Hou, Y.', 'Min, Y.', 'Zhang, B.', 'Zhang, J.', 'Dong, Z.', 'Du, Y.', 'Yang, C.', 'Chen, Y.', 'Chen, Z.', 'Jiang, J.', 'Ren, R.', 'Li, Y.', 'Tang, X.', 'Liu, Z.', 'Liu, P.', 'Nie, J.-Y.', 'Wen, J.-R.'],
      year: 2023,
      venue: 'arXiv preprint',
      url: 'https://arxiv.org/abs/2303.18223',
    },
  },
  {
    term: 'LoRA',
    letter: 'L',
    category: 'Fine-tuning',
    aka: ['Low-Rank Adaptation'],
    definition:
      'A parameter-efficient fine-tuning method that learns small low-rank updates instead of full weight matrices.',
    details:
      'LoRA freezes the original weights and adds a small trainable low-rank decomposition to each of them, cutting trainable parameters by orders of magnitude. It dramatically reduces the memory and storage needed to adapt a model and allows many lightweight task-specific adapters to be swapped onto one base model.',
    citation: {
      title: 'LoRA: Low-Rank Adaptation of Large Language Models',
      authors: ['Hu, E. J.', 'Shen, Y.', 'Wallis, P.', 'Allen-Zhu, Z.', 'Li, Y.', 'Wang, S.', 'Wang, L.', 'Chen, W.'],
      year: 2022,
      venue: 'International Conference on Learning Representations (ICLR)',
      url: 'https://arxiv.org/abs/2106.09685',
    },
  },

  // ------------------------------------------------------------- M – N
  {
    term: 'Machine Learning',
    letter: 'M',
    category: 'Foundations',
    aka: ['ML'],
    definition:
      'Programming computers to learn from experience (data) rather than from explicitly written rules.',
    details:
      'Arthur Samuel defined the field in 1959 as giving computers “the ability to learn without being explicitly programmed,” demonstrated with a checkers program that improved by playing itself. Modern machine learning spans supervised, unsupervised and reinforcement learning, and underlies almost every recent advance in AI.',
    citation: {
      title: 'Some Studies in Machine Learning Using the Game of Checkers',
      authors: ['Samuel, A. L.'],
      year: 1959,
      venue: 'IBM Journal of Research and Development 3(3), 210–229',
      url: 'https://doi.org/10.1147/rd.33.0210',
    },
  },
  {
    term: 'Mixture of Experts',
    letter: 'M',
    category: 'Architecture',
    aka: ['MoE', 'Sparsely-gated MoE'],
    definition:
      'An architecture with many specialized sub-networks (experts) plus a router that activates only a few per input.',
    details:
      'MoE layers keep a huge number of parameters but compute with only a small subset for each token, so they can scale parameter count without proportionally scaling per-token compute. The sparsely-gated approach demonstrated this at massive scale; today many frontier LLMs use MoE to combine large capacity with efficient inference.',
    citation: {
      title: 'Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer',
      authors: ['Shazeer, N.', 'Mirhoseini, A.', 'Maziarz, K.', 'Davis, A.', 'Le, Q.', 'Hinton, G.', 'Dean, J.'],
      year: 2017,
      venue: 'International Conference on Learning Representations (ICLR)',
      url: 'https://arxiv.org/abs/1701.06538',
    },
  },
  {
    term: 'Multimodal Model',
    letter: 'M',
    category: 'Architecture',
    aka: ['Vision-language model', 'VLM'],
    definition:
      'A model that processes and connects more than one modality, most commonly text and images.',
    details:
      'Multimodal models learn a shared representation space so that concepts can be transferred across senses — for example, matching an image to a caption that describes it. CLIP trained image and text encoders on 400 million image–text pairs using contrastive learning, enabling zero-shot image classification and powering later generation pipelines.',
    citation: {
      title: 'Learning Transferable Visual Models From Natural Language Supervision',
      authors: ['Radford, A.', 'Kim, J. W.', 'Hallacy, C.', 'Ramesh, A.', 'Goh, G.', 'Agarwal, S.', 'Sastry, G.', 'Askell, A.', 'Mishkin, P.', 'Clark, J.', 'Krueger, G.', 'Sutskever, I.'],
      year: 2021,
      venue: 'Proceedings of ICML',
      url: 'https://arxiv.org/abs/2103.00020',
    },
  },
  {
    term: 'Neural Network',
    letter: 'N',
    category: 'Foundations',
    aka: ['Artificial neural network', 'ANN'],
    definition:
      'A computing system of connected units (“neurons”) organized in layers that learns by adjusting connection weights.',
    details:
      'Inspired by biological neurons, the perceptron showed a single weighted unit could learn simple classifications. Stacking such units into layers — with nonlinear activations — lets networks approximate complex functions, and modern neural networks learn their own internal features from raw data.',
    citation: {
      title: 'The Perceptron: A Probabilistic Model for Information Storage and Organization in the Brain',
      authors: ['Rosenblatt, F.'],
      year: 1958,
      venue: 'Psychological Review 65(6), 386–408',
      url: 'https://doi.org/10.1037/h0042519',
    },
  },

  // ------------------------------------------------------------- O – P
  {
    term: 'Overfitting',
    letter: 'O',
    category: 'Training',
    aka: ['Over-training'],
    definition:
      'A model that fits its training data extremely well but generalizes poorly to new data.',
    details:
      'Overfitting occurs when a model is powerful enough to memorize noise and idiosyncrasies in the training set instead of learning underlying structure. It is guarded against with regularization, data augmentation, early stopping, dropout and evaluation on held-out validation and test sets.',
    citation: {
      title: 'Deep Learning (Ch. 5: Machine Learning Basics)',
      authors: ['Goodfellow, I.', 'Bengio, Y.', 'Courville, A.'],
      year: 2016,
      venue: 'MIT Press',
      url: 'https://www.deeplearningbook.org/',
    },
  },
  {
    term: 'Perplexity',
    letter: 'P',
    category: 'Evaluation',
    aka: ['PPL'],
    definition:
      'A language-model evaluation metric equal to the inverse probability of a test corpus, normalized per word.',
    details:
      'Lower perplexity means the model assigns higher probability to held-out text, i.e. it “surprises” less. It is the exponential of average negative log-likelihood and is standard for comparing language models, though it correlates only loosely with quality on downstream tasks such as generation or reasoning.',
    citation: {
      title: 'Speech and Language Processing (3rd ed. draft)',
      authors: ['Jurafsky, D.', 'Martin, J. H.'],
      year: 2024,
      venue: 'Stanford University (online textbook)',
      url: 'https://web.stanford.edu/~jurafsky/slp3/',
    },
  },
  {
    term: 'Pre-training',
    letter: 'P',
    category: 'Training',
    aka: ['Self-supervised pre-training'],
    definition:
      'Training a model on a large, unlabeled corpus with a self-supervised objective before task-specific adaptation.',
    details:
      'Pre-training learns general representations from abundant raw data — predicting the next word, filling masked tokens, or matching context. ELMo demonstrated that deeply contextualized word representations from a pre-trained language model improved many NLP tasks, setting the pattern of pre-train-then-adapt that all modern LLMs follow.',
    citation: {
      title: 'Deep Contextualized Word Representations',
      authors: ['Peters, M. E.', 'Neumann, M.', 'Iyyer, M.', 'Gardner, M.', 'Clark, C.', 'Lee, K.', 'Zettlemoyer, L.'],
      year: 2018,
      venue: 'Proceedings of NAACL-HLT',
      url: 'https://arxiv.org/abs/1802.05365',
    },
  },
  {
    term: 'Prompt Engineering',
    letter: 'P',
    category: 'Prompting',
    aka: ['Prompting'],
    definition:
      'Designing and refining the input text given to a model to steer its output toward a desired result.',
    details:
      'Because LLMs are controlled through their input, the wording, structure and examples in a prompt matter enormously. Practices include clear instructions, role framing, few-shot examples, chain-of-thought and output formatting. The DAIR.AI Prompt Engineering Guide is a widely used practical reference for these techniques.',
    citation: {
      title: 'Prompt Engineering Guide',
      authors: ['DAIR.AI'],
      year: 2023,
      venue: 'Online guide',
      url: 'https://www.promptingguide.ai/',
    },
  },

  // ------------------------------------------------------------- Q – R
  {
    term: 'QLoRA',
    letter: 'Q',
    category: 'Fine-tuning',
    aka: ['Quantized LoRA'],
    definition:
      'LoRA fine-tuning applied to a base model stored in low precision (4-bit), making full fine-tuning affordable on a single GPU.',
    details:
      'QLoRA backpropagates through a frozen, 4-bit quantized model while training small LoRA adapters, and adds paged optimizers and double quantization to cut memory further. It demonstrated that a 65-billion-parameter model could be fine-tuned on a single 48 GB GPU with quality rivaling full fine-tuning.',
    citation: {
      title: 'QLoRA: Efficient Finetuning of Quantized LLMs',
      authors: ['Dettmers, T.', 'Pagnoni, A.', 'Holtzman, A.', 'Zettlemoyer, L.'],
      year: 2023,
      venue: 'Advances in Neural Information Processing Systems 36 (NeurIPS)',
      url: 'https://arxiv.org/abs/2305.14314',
    },
  },
  {
    term: 'Quantization',
    letter: 'Q',
    category: 'Compression',
    aka: ['Low-bit inference', 'Model quantization'],
    definition:
      'Reducing the numeric precision of a model’s weights (e.g. from 16-bit to 8-bit or 4-bit) to cut memory and speed inference.',
    details:
      'Quantization maps continuous weights to a small set of discrete values. LLM.int8() showed that 8-bit inference could run large Transformers without degradation by separating outlier dimensions, which appear at scale, from the rest of the activations. Lower-bit formats (4-bit) are now routine for running large models on consumer hardware.',
    citation: {
      title: 'LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale',
      authors: ['Dettmers, T.', 'Lewis, M.', 'Belkada, Y.', 'Zettlemoyer, L.'],
      year: 2022,
      venue: 'Advances in Neural Information Processing Systems 35 (NeurIPS)',
      url: 'https://arxiv.org/abs/2208.07339',
    },
  },
  {
    term: 'Retrieval-Augmented Generation',
    letter: 'R',
    category: 'Augmentation',
    aka: ['RAG'],
    definition:
      'Grounding a generator with documents retrieved from an external store so answers can cite fresh, factual sources.',
    details:
      'RAG first retrieves relevant passages for a query, then feeds them to a generator along with the question. Because the knowledge comes from an external corpus, RAG reduces hallucination, allows updating knowledge without retraining, and is the architecture behind many “chat with your documents” assistants.',
    citation: {
      title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
      authors: ['Lewis, P.', 'Perez, E.', 'Piktus, A.', 'Petroni, F.', 'Karpukhin, V.', 'Goyal, N.', 'Küttler, H.', 'Lewis, M.', 'Yih, W.-t.', 'Rocktäschel, T.', 'Riedel, S.', 'Kiela, D.'],
      year: 2020,
      venue: 'Advances in Neural Information Processing Systems 33 (NeurIPS)',
      url: 'https://arxiv.org/abs/2005.11401',
    },
  },
  {
    term: 'Recurrent Neural Network',
    letter: 'R',
    category: 'Architecture',
    aka: ['RNN'],
    definition:
      'A neural network with connections that loop over time, maintaining a hidden state while processing sequences.',
    details:
      'RNNs process each element of a sequence while updating a hidden state that carries information from earlier steps, making them natural for time series and language. Elman’s work on finding structure in time showed such networks can learn temporal patterns and predictions from sequences alone. RNNs and their LSTM variants dominated sequence modeling until Transformers replaced them.',
    citation: {
      title: 'Finding Structure in Time',
      authors: ['Elman, J. L.'],
      year: 1990,
      venue: 'Cognitive Science 14(2), 179–211',
      url: 'https://doi.org/10.1207/s15516709cog1402_1',
    },
  },
  {
    term: 'RLHF',
    letter: 'R',
    category: 'Alignment',
    aka: ['Reinforcement Learning from Human Feedback'],
    definition:
      'Fine-tuning a model with a reward model trained on human preferences, via reinforcement learning, to better follow instructions.',
    details:
      'Human annotators rank several model outputs; those rankings train a reward model that then scores generations during reinforcement learning. InstructGPT showed this pipeline makes language models more helpful and less harmful than pure pre-trained models of the same size, and RLHF is a central technique in aligning modern assistants.',
    citation: {
      title: 'Training language models to follow instructions with human feedback',
      authors: ['Ouyang, L.', 'Wu, J.', 'Jiang, X.', 'Almeida, D.', 'Wainwright, C.', 'Mishkin, P.', 'Zhang, C.', 'Agarwal, S.', 'Slama, K.', 'Ray, A.', 'Johns, J.', 'Elhage, N.', 'Tran, B.', 'Lowe, R.', 'Hendel, H.', 'Cumming, T.', 'Amodei, D.'],
      year: 2022,
      venue: 'Advances in Neural Information Processing Systems 35 (NeurIPS)',
      url: 'https://arxiv.org/abs/2203.02155',
    },
  },

  // ------------------------------------------------------------- S – T
  {
    term: 'Sequence-to-Sequence',
    letter: 'S',
    category: 'Architecture',
    aka: ['Seq2Seq'],
    definition:
      'A model architecture that maps one sequence (such as a sentence) to another (such as its translation).',
    details:
      'The seq2seq model used two recurrent networks — an encoder that reads the input into a vector, and a decoder that generates the output from it — and set the standard for neural machine translation. It established the encoder–decoder pattern that the Transformer later generalized with attention.',
    citation: {
      title: 'Sequence to Sequence Learning with Neural Networks',
      authors: ['Sutskever, I.', 'Vinyals, O.', 'Le, Q. V.'],
      year: 2014,
      venue: 'Advances in Neural Information Processing Systems 27 (NeurIPS)',
      url: 'https://arxiv.org/abs/1409.3215',
    },
  },
  {
    term: 'Supervised Learning',
    letter: 'S',
    category: 'Learning Paradigms',
    aka: ['Supervised machine learning'],
    definition:
      'Learning a mapping from inputs to outputs from labeled examples, such as (image, object class) pairs.',
    details:
      'In supervised learning the training data carries ground-truth labels, and the model is scored against them during training. It covers classification and regression and is the most common paradigm, but it depends on the availability and quality of labeled data.',
    citation: {
      title: 'Deep Learning (Ch. 5: Machine Learning Basics)',
      authors: ['Goodfellow, I.', 'Bengio, Y.', 'Courville, A.'],
      year: 2016,
      venue: 'MIT Press',
      url: 'https://www.deeplearningbook.org/',
    },
  },
  {
    term: 'Temperature',
    letter: 'T',
    category: 'Inference',
    aka: ['Sampling temperature'],
    definition:
      'A decoding parameter that sharpens or flattens the token probability distribution, controlling randomness.',
    details:
      'A low temperature makes the most probable tokens even more likely, producing repetitive, focused text; a high temperature flattens the distribution for more varied and creative output. Temperature is one of several sampling controls (with top-k and nucleus/top-p) studied for improving the quality of open-ended neural text generation.',
    citation: {
      title: 'The Curious Case of Neural Text Degeneration',
      authors: ['Holtzman, A.', 'Buys, J.', 'Du, L.', 'Forbes, M.', 'Choi, Y.'],
      year: 2020,
      venue: 'International Conference on Learning Representations (ICLR)',
      url: 'https://arxiv.org/abs/1904.09751',
    },
  },
  {
    term: 'Tokenization',
    letter: 'T',
    category: 'Tokenization',
    aka: ['Tokenizing', 'Subword segmentation'],
    definition:
      'Splitting raw text into the atomic units (tokens) that a model actually consumes.',
    details:
      'A tokenizer converts text into a sequence of integer token ids, usually subword units rather than whole words, so any string can be represented with a finite vocabulary. SentencePiece is a language-agnostic subword toolkit that trains segmenters directly on raw text and is used by many multilingual models, including T5 and Llama.',
    citation: {
      title: 'SentencePiece: A simple and language independent subword tokenizer and detokenizer for Neural Text Processing',
      authors: ['Kudo, T.', 'Richardson, J.'],
      year: 2018,
      venue: 'Proceedings of EMNLP (System Demonstrations)',
      url: 'https://arxiv.org/abs/1808.06226',
    },
  },
  {
    term: 'Transformer',
    letter: 'T',
    category: 'Architecture',
    aka: ['Transformer network'],
    definition:
      'A neural architecture based on self-attention rather than recurrence or convolution, the foundation of modern LLMs.',
    details:
      'The Transformer processes entire sequences in parallel, using multi-head self-attention to model pairwise relationships and positional encodings to retain order. Removing recurrence made training dramatically more parallelizable, enabling the scaling that produced GPT, BERT and today’s large language models.',
    citation: {
      title: 'Attention Is All You Need',
      authors: ['Vaswani, A.', 'et al.'],
      year: 2017,
      venue: 'Advances in Neural Information Processing Systems 30 (NeurIPS)',
      url: 'https://arxiv.org/abs/1706.03762',
    },
  },

  // ------------------------------------------------------------- U – V
  {
    term: 'Unsupervised Learning',
    letter: 'U',
    category: 'Learning Paradigms',
    aka: ['Self-organization'],
    definition:
      'Learning structure from data that has no labels, such as clustering, density estimation or representation learning.',
    details:
      'Without ground-truth answers, unsupervised methods discover patterns — grouping similar points, compressing data, or predicting parts of the input from the rest. Self-supervised pre-training of language models is a form of this, since the “labels” (the next word) come from the data itself.',
    citation: {
      title: 'Deep Learning (Ch. 5: Machine Learning Basics)',
      authors: ['Goodfellow, I.', 'Bengio, Y.', 'Courville, A.'],
      year: 2016,
      venue: 'MIT Press',
      url: 'https://www.deeplearningbook.org/',
    },
  },
  {
    term: 'Variational Autoencoder',
    letter: 'V',
    category: 'Generative Models',
    aka: ['VAE'],
    definition:
      'A generative model that learns a compressed, probabilistic latent space from which new data can be sampled.',
    details:
      'A VAE encodes inputs into a distribution over latent variables and decodes samples back into data, trained by maximizing a lower bound on the data likelihood. The structured latent space enables smooth interpolation and generation, and VAEs underpin many later generative and representation-learning systems.',
    citation: {
      title: 'Auto-Encoding Variational Bayes',
      authors: ['Kingma, D. P.', 'Welling, M.'],
      year: 2014,
      venue: 'International Conference on Learning Representations (ICLR)',
      url: 'https://arxiv.org/abs/1312.6114',
    },
  },
  {
    term: 'Vision Transformer',
    letter: 'V',
    category: 'Vision',
    aka: ['ViT'],
    definition:
      'A Transformer applied directly to images by treating patches of pixels as tokens.',
    details:
      'ViT splits an image into fixed-size patches, flattens each into a vector, and processes them with the standard Transformer encoder. With enough pre-training data it matches or beats convolutional networks on image classification, showing that attention-based models can be competitive in vision without built-in spatial priors.',
    citation: {
      title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale',
      authors: ['Dosovitskiy, A.', 'Beyer, L.', 'Kolesnikov, A.', 'Weissenborn, D.', 'Zhai, X.', 'Unterthiner, T.', 'Dehghani, M.', 'Minderer, M.', 'Heigold, G.', 'Gelly, S.', 'Uszkoreit, J.', 'Houlsby, N.'],
      year: 2021,
      venue: 'International Conference on Learning Representations (ICLR)',
      url: 'https://arxiv.org/abs/2010.11929',
    },
  },

  // ------------------------------------------------------------- W – X
  {
    term: 'Word2Vec',
    letter: 'W',
    category: 'Representations',
    aka: ['word2vec'],
    definition:
      'An early and influential family of models that learned word embeddings from large corpora using shallow neural networks.',
    details:
      'Word2Vec introduced the continuous bag-of-words (CBOW) and skip-gram objectives, predicting a word from its context or vice versa. Its embeddings captured semantic and syntactic regularities — famously king − man + woman ≈ queen — and demonstrated that cheap, fast models could learn rich word meaning from raw text.',
    citation: {
      title: 'Efficient Estimation of Word Representations in Vector Space',
      authors: ['Mikolov, T.', 'Chen, K.', 'Corrado, G.', 'Dean, J.'],
      year: 2013,
      venue: 'International Conference on Learning Representations (ICLR)',
      url: 'https://arxiv.org/abs/1301.3781',
    },
  },
  {
    term: 'Xavier Initialization',
    letter: 'X',
    category: 'Training',
    aka: ['Glorot initialization'],
    definition:
      'A weight-initialization scheme that keeps the variance of activations and gradients stable across layers.',
    details:
      'Poor initialization lets signals vanish or explode as they pass through deep networks, stalling training. Xavier (Glorot) initialization scales weights according to the number of input and output units so that variance is preserved layer to layer; it was a key enabler for training deep feedforward and recurrent networks.',
    citation: {
      title: 'Understanding the difficulty of training deep feedforward neural networks',
      authors: ['Glorot, X.', 'Bengio, Y.'],
      year: 2010,
      venue: 'Proceedings of the 13th International Conference on AISTATS',
      url: 'http://proceedings.mlr.press/v9/glorot10a.html',
    },
  },
  {
    term: 'XGBoost',
    letter: 'X',
    category: 'Classical ML',
    aka: ['Extreme Gradient Boosting'],
    definition:
      'A highly optimized, scalable implementation of gradient-boosted decision trees, a leading method for tabular data.',
    details:
      'XGBoost builds an ensemble of shallow decision trees sequentially, each correcting its predecessors’ errors, with regularization and clever engineering (sparsity awareness, cache-aware access) for speed. It has dominated structured/tabular machine-learning competitions and remains a strong baseline that deep networks rarely beat on such data.',
    citation: {
      title: 'XGBoost: A Scalable Tree Boosting System',
      authors: ['Chen, T.', 'Guestrin, C.'],
      year: 2016,
      venue: 'Proceedings of the 22nd ACM SIGKDD',
      url: 'https://arxiv.org/abs/1603.02754',
    },
  },

  // ------------------------------------------------------------- Y – Z
  {
    term: 'YOLO',
    letter: 'Y',
    category: 'Vision',
    aka: ['You Only Look Once'],
    definition:
      'A real-time object detection model that predicts bounding boxes and classes in a single pass over the image.',
    details:
      'Unlike sliding-window detectors, YOLO reframes detection as a single regression problem: one network looks at the whole image and directly outputs boxes and class probabilities. This unified design made detection extremely fast while remaining accurate, enabling real-time video applications.',
    citation: {
      title: 'You Only Look Once: Unified, Real-Time Object Detection',
      authors: ['Redmon, J.', 'Divvala, S.', 'Girshick, R.', 'Farhadi, A.'],
      year: 2016,
      venue: 'Proceedings of the IEEE CVPR',
      url: 'https://arxiv.org/abs/1506.02640',
    },
  },
  {
    term: 'Zero-Shot Learning',
    letter: 'Z',
    category: 'In-Context Learning',
    aka: ['Zero-shot prompting', 'Zero-shot inference'],
    definition:
      'Solving a task with no examples at all — only an instruction — relying on knowledge already in the model.',
    details:
      'Zero-shot means the model never saw a labeled example of the task, yet answers from its instruction and pre-trained knowledge. LLMs can reason zero-shot by being asked to think step by step, a simple technique that matches or beats earlier few-shot methods on many benchmarks.',
    citation: {
      title: 'Large Language Models are Zero-Shot Reasoners',
      authors: ['Kojima, T.', 'Gu, S. S.', 'Reid, M.', 'Matsuo, Y.', 'Iwasawa, Y.'],
      year: 2022,
      venue: 'Advances in Neural Information Processing Systems 35 (NeurIPS)',
      url: 'https://arxiv.org/abs/2205.11916',
    },
  },
  {
    term: "Zipf's Law",
    letter: 'Z',
    category: 'Linguistics',
    aka: ['Zipf distribution'],
    definition:
      'The empirical rule that the frequency of a word is roughly inversely proportional to its rank in the corpus.',
    details:
      'In natural language the most common word appears about twice as often as the second most common, three times as often as the third, and so on. Zipfian (power-law) structure appears throughout text and explains why tokenizers work well and why long-tail words are rare — an important fact when modeling language.',
    citation: {
      title: 'Power laws, Pareto distributions and Zipf’s law',
      authors: ['Newman, M. E. J.'],
      year: 2005,
      venue: 'Contemporary Physics 46(5), 323–351',
      url: 'https://arxiv.org/abs/cond-mat/0412004',
    },
  },
];

// -----------------------------------------------------------------------------
//  Write files
// -----------------------------------------------------------------------------
const folderSet = new Set();
let written = 0;
const seenLetters = new Set();

for (const entry of ENTRIES) {
  const folder = folderFor(entry.letter);
  folderSet.add(folder);
  seenLetters.add(entry.letter);

  const slug = slugify(entry.term);
  const file = join(ROOT, 'dictionary', folder, `${slug}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...entry, slug }, null, 2) + '\n');
  written++;
}

// sanity: every letter A-Z must have at least one entry
const missing = [];
for (let code = 65; code <= 90; code++) {
  const L = String.fromCharCode(code);
  if (!seenLetters.has(L)) missing.push(L);
}

console.log(`✓ Wrote ${written} term files.`);
console.log(`  Folders used: ${[...folderSet].sort().join(', ')}`);
if (missing.length) {
  console.warn(`  ⚠ No entries for letter(s): ${missing.join(', ')}`);
} else {
  console.log('  Every letter A–Z is represented. ✓');
}
