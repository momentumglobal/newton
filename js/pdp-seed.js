// js/pdp-seed.js — default Development & Performance content (N-436 / PDP-4). Pure data: no code,
// no network I/O, no DOM. Consumed by pdpSeedPlan() (pdp-data.js) when Admin / People Ops press
// "Seed defaults" on People > PDP Setup. Create-only: a row that already exists is never touched.
//
// Source: Notion "Performance/Capability Framework Prototype" (last edited 20 May 2026) and the
// "PDP Designs" pages (Annual 13 Aug, Bi-Annual 4 Nov, Quarterly 13 Aug, Monthly 4 Nov 2026).
// Framework: L1-L4 IC, L5 MG (SDM) and an empty L5 IC set for PTP (PDP-D5). No L6 (CSDs review,
// they are not scored). The Bi-Annual template has no Reward section and no outcome list: the
// pillar scoring block replaces it (PDP-D3, PDP-D4). Edit the text in Newton, not here: this file
// only fills gaps. Not part of the MCP bundle.

const PDP_SEED = {
 "pillars": [
  {
   "key": "own-it",
   "name": "We Own It & Lift the Bar"
  },
  {
   "key": "decide",
   "name": "We Decide with Clarity & Confidence"
  },
  {
   "key": "communicate",
   "name": "We Communicate Openly & Build Trust"
  },
  {
   "key": "support",
   "name": "We Support People & Grow Potential"
  },
  {
   "key": "curious",
   "name": "We Stay Curious & Keep Improving"
  },
  {
   "key": "adapt",
   "name": "We Adapt & Stay Resilient"
  }
 ],
 "framework": [
  {
   "level": "L1",
   "track": "IC",
   "descriptors": {
    "own-it": {
     "Below": "Misses deadlines or needs repeated reminders to complete tasks; avoids accountability when things go wrong",
     "Meets": "Completes assigned tasks on time and flags blockers early; takes responsibility for their own work",
     "Exceeding": "Proactively takes on additional responsibilities without being asked; self-corrects and learns visibly from mistakes"
    },
    "decide": {
     "Below": "Struggles to make basic decisions without significant guidance; frequently escalates simple problems",
     "Meets": "Makes straightforward decisions within their scope with support; knows when to escalate",
     "Exceeding": "Begins to show independent judgement on routine tasks; offers considered options rather than just asking for answers"
    },
    "communicate": {
     "Below": "Communication is unclear, infrequent, or requires chasing; updates are reactive rather than proactive",
     "Meets": "Provides clear, timely updates to their manager and team; is honest when they don't know something",
     "Exceeding": "Communicates confidently with stakeholders beyond their immediate team; builds early rapport with customers or colleagues"
    },
    "support": {
     "Below": "Shows little interest in peer support or team contribution; focused only on personal tasks",
     "Meets": "Supports teammates when asked; receptive to feedback and acts on it",
     "Exceeding": "Actively helps peers, shares learnings, and seeks feedback without prompting"
    },
    "curious": {
     "Below": "Rarely asks questions or seeks to understand the wider context of their work",
     "Meets": "Asks questions to deepen understanding; shows willingness to learn new approaches",
     "Exceeding": "Proactively researches better ways of doing things; brings ideas or observations to their manager"
    },
    "adapt": {
     "Below": "Becomes visibly unsettled by change or shifting priorities; needs significant reassurance",
     "Meets": "Adjusts to changing priorities with support; maintains a positive attitude through uncertainty",
     "Exceeding": "Adapts quickly with minimal disruption; helps steady others in the team during periods of change"
    }
   }
  },
  {
   "level": "L2",
   "track": "IC",
   "descriptors": {
    "own-it": {
     "Below": "Delivers inconsistently; deflects responsibility when outcomes fall short",
     "Meets": "Reliably delivers on commitments; holds themselves accountable and closes the loop on actions",
     "Exceeding": "Consistently delivers to a high standard and raises the quality bar for those around them; actively drives customer satisfaction"
    },
    "decide": {
     "Below": "Relies heavily on manager input for decisions within their own scope; lacks confidence to act",
     "Meets": "Makes sound decisions independently within their role; escalates appropriately with context",
     "Exceeding": "Anticipates issues before they arise and takes pre-emptive action; helps structure solutions for their team"
    },
    "communicate": {
     "Below": "Inconsistent in sharing updates; communication lacks clarity or can cause confusion",
     "Meets": "Keeps relevant people informed clearly and on time; builds credibility through transparency",
     "Exceeding": "Proactively manages expectations with customers and stakeholders; trusted as a reliable point of contact"
    },
    "support": {
     "Below": "Disengaged from team development; reluctant to share knowledge or give feedback",
     "Meets": "Shares knowledge freely; gives and receives constructive feedback in a professional way",
     "Exceeding": "Informally buddies with Level 1 colleagues; recognised by peers as a supportive, trusted team member"
    },
    "curious": {
     "Below": "Accepts the status quo; rarely looks for efficiencies or improvement opportunities",
     "Meets": "Identifies areas for improvement in their own work and raises them with their manager",
     "Exceeding": "Suggests and pilots process improvements; brings new ideas that create visible impact for the team or customer"
    },
    "adapt": {
     "Below": "Struggles with ambiguity; performance dips noticeably when plans change",
     "Meets": "Manages shifting priorities effectively; maintains composure and keeps work moving through change",
     "Exceeding": "Thrives in ambiguity; helps others recalibrate and stay focused when priorities shift"
    }
   }
  },
  {
   "level": "L3",
   "track": "IC",
   "descriptors": {
    "own-it": {
     "Below": "Takes a passive role in project outcomes; points to external factors rather than taking ownership",
     "Meets": "Owns their workstreams end-to-end; proactively manages risks and keeps stakeholders updated",
     "Exceeding": "Takes ownership beyond their defined scope; drives strong customer outcomes and is cited positively in feedback"
    },
    "decide": {
     "Below": "Hesitates under pressure; decisions often lack structure or miss key considerations",
     "Meets": "Makes well-reasoned decisions with limited guidance; brings clarity to complex situations",
     "Exceeding": "Provides clear direction to others in ambiguous situations; their judgement is sought by peers and managers"
    },
    "communicate": {
     "Below": "Inconsistent in customer communication; over- or under-communicates, leading to misalignment",
     "Meets": "Communicates confidently with customers and internal stakeholders; honest and clear in difficult conversations",
     "Exceeding": "Builds strong, trusted relationships with customers; proactively manages expectations and earns repeat confidence"
    },
    "support": {
     "Below": "Limited engagement in developing others; feedback is rare or surface-level",
     "Meets": "Actively supports junior colleagues; delivers meaningful, specific feedback that helps others improve",
     "Exceeding": "Creates visible development opportunities for others; known as a coach and a go-to person for advice"
    },
    "curious": {
     "Below": "Rarely challenges existing approaches; settles for \"good enough\"",
     "Meets": "Continuously looks for smarter ways to work; shares learnings across the team",
     "Exceeding": "Champions a culture of improvement; improvements they lead have measurable positive impact on team or customer experience"
    },
    "adapt": {
     "Below": "Resistant to change; needs significant support when projects deviate from plan",
     "Meets": "Navigates change confidently; adjusts plans and communicates impacts clearly",
     "Exceeding": "Acts as a stabilising force for the team; models composure and helps others maintain momentum through disruption"
    }
   }
  },
  {
   "level": "L4",
   "track": "IC",
   "descriptors": {
    "own-it": {
     "Below": "Inconsistently models ownership; accountability gaps visible to the team or customers",
     "Meets": "Fully accountable for complex workstreams and customer outcomes; sets a visible standard for delivery",
     "Exceeding": "Elevates team performance through their example; directly linked to exceptional customer satisfaction scores or feedback"
    },
    "decide": {
     "Below": "Decisions are reactive or lack sufficient rigour; creates confusion rather than clarity",
     "Meets": "Makes confident, well-structured decisions; brings others along and explains reasoning clearly",
     "Exceeding": "Trusted to lead decision-making on high-stakes or complex situations; increases confidence and capability of those around them"
    },
    "communicate": {
     "Below": "Communication style creates friction or erodes trust with customers or colleagues",
     "Meets": "Communicates with authority and empathy; transparent in both good and difficult situations",
     "Exceeding": "Recognised by customers and peers as an exceptional communicator; proactively shapes narratives and manages complexity"
    },
    "support": {
     "Below": "Doesn't invest meaningfully in developing others; seen as siloed",
     "Meets": "Consistently invests in the growth of junior colleagues; feedback is actionable and well-received",
     "Exceeding": "Acts as an informal lead for the IC team; development contributions are visible and create lasting impact"
    },
    "curious": {
     "Below": "Defaults to existing methods; resists challenge or new thinking",
     "Meets": "Challenges assumptions constructively; leads improvements and takes others on the journey",
     "Exceeding": "Drives strategic-level improvements; recognised internally and by customers for innovation and forward thinking"
    },
    "adapt": {
     "Below": "Performance suffers during periods of uncertainty; may amplify rather than reduce team anxiety",
     "Meets": "Leads by example through change; keeps their team anchored and focused",
     "Exceeding": "Proactively shapes how change is communicated and managed; raises the resilience of the whole team"
    }
   }
  },
  {
   "level": "L5",
   "track": "MG",
   "descriptors": {
    "own-it": {
     "Below": "Ownership is inconsistent across their team; gaps in delivery are not addressed proactively",
     "Meets": "Accountable for team and customer outcomes; holds a high standard and role-models it consistently",
     "Exceeding": "Creates a culture of accountability; team performance measurably improves under their leadership and customer outcomes reflect this"
    },
    "decide": {
     "Below": "Decisions are slow, unclear, or create ambiguity for the team",
     "Meets": "Makes timely, well-reasoned decisions; provides the team with clear direction and priorities",
     "Exceeding": "Navigates complex, high-pressure decisions confidently; simplifies complexity and enables the team to act with focus"
    },
    "communicate": {
     "Below": "Communication gaps create misalignment within the team or with customers; the \"why\" is rarely shared",
     "Meets": "Communicates openly with their team and customers; transparent about challenges and reasoning",
     "Exceeding": "Builds deep trust across all levels; proactively manages customer relationships and is frequently cited in positive feedback"
    },
    "support": {
     "Below": "Development conversations are infrequent or surface-level; team growth is not prioritised",
     "Meets": "Actively develops their team through regular coaching, feedback, and stretch opportunities",
     "Exceeding": "Creates individually tailored development paths; team retention and progression are strong indicators of their people investment"
    },
    "curious": {
     "Below": "Maintains the status quo; improvement ideas from the team are not acted on or encouraged",
     "Meets": "Fosters a culture of curiosity; actively looks for and implements process and service improvements",
     "Exceeding": "Leads operational innovation; improvements they champion have business-wide or customer-visible impact"
    },
    "adapt": {
     "Below": "Struggles to maintain team stability during change; uncertainty is amplified rather than managed",
     "Meets": "Leads the team confidently through change; maintains morale and productivity when priorities shift",
     "Exceeding": "Acts as an anchor for the business during disruption; their leadership during uncertainty is recognised and trusted at a senior level"
    }
   }
  },
  {
   "level": "L5",
   "track": "IC",
   "descriptors": null
  }
 ],
 "templates": {
  "Annual": {
   "schema": 1,
   "sections": [
    {
     "key": "looking-back",
     "title": "Looking Back",
     "blocks": [
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What are you most proud of?",
       "hint": "Before looking ahead, take a moment to reflect on the previous year. This can be specific KPIs, or something about a specific account you were on. Use the time to truly look back at the last year and use your self-awareness to reflect.",
       "required": false,
       "key": "what-are-you-most-proud-of"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What have you enjoyed most?",
       "hint": "",
       "required": false,
       "key": "what-have-you-enjoyed-most"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What have you found most challenging?",
       "hint": "",
       "required": false,
       "key": "what-have-you-found-most-challenging"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What have you learned about yourself?",
       "hint": "",
       "required": false,
       "key": "what-have-you-learned-about-yourself"
      }
     ]
    },
    {
     "key": "career-aspirations",
     "title": "Career & Aspirations",
     "blocks": [
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "Where do you see yourself progressing over the next 12-24 months?",
       "hint": "Career aspirations.",
       "required": false,
       "key": "where-do-you-see-yourself-progressing-ov"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What skills, experiences or opportunities would help you get there?",
       "hint": "What are your biggest strengths? Which strengths would you like to build on further? What skills or behaviours would you like to develop? Where do you want to stretch yourself? What support will help you achieve this?",
       "required": false,
       "key": "what-skills-experiences-or-opportunities"
      }
     ]
    },
    {
     "key": "readiness-discussion",
     "title": "Readiness Discussion",
     "blocks": [
      {
       "type": "prompt",
       "label": "Strengths",
       "hint": "Manager and employee discuss.",
       "required": false,
       "key": "strengths"
      },
      {
       "type": "prompt",
       "label": "Areas for development",
       "hint": "",
       "required": false,
       "key": "areas-for-development"
      },
      {
       "type": "prompt",
       "label": "Progress toward next level",
       "hint": "",
       "required": false,
       "key": "progress-toward-next-level"
      },
      {
       "type": "prompt",
       "label": "Experiences needed before progression",
       "hint": "",
       "required": false,
       "key": "experiences-needed-before-progression"
      },
      {
       "type": "prompt",
       "label": "What do you want your career to look like over the next 1 year?",
       "hint": "",
       "required": false,
       "key": "what-do-you-want-your-career-to-look-lik"
      },
      {
       "type": "prompt",
       "label": "What do you want your career to look like over the next 3 years?",
       "hint": "",
       "required": false,
       "key": "what-do-you-want-your-career-to-look-l-2"
      },
      {
       "type": "prompt",
       "label": "What motivates you most at work?",
       "hint": "",
       "required": false,
       "key": "what-motivates-you-most-at-work"
      },
      {
       "type": "prompt",
       "label": "What motivates you most outside of work?",
       "hint": "",
       "required": false,
       "key": "what-motivates-you-most-outside-of-work"
      },
      {
       "type": "prompt",
       "label": "What type of work gives you the most energy?",
       "hint": "",
       "required": false,
       "key": "what-type-of-work-gives-you-the-most-ene"
      },
      {
       "type": "prompt",
       "label": "What opportunities or experiences would you like to have this year?",
       "hint": "",
       "required": false,
       "key": "what-opportunities-or-experiences-would"
      }
     ]
    },
    {
     "key": "annual-goals",
     "title": "Annual Goals",
     "blocks": [
      {
       "type": "goalSet",
       "level": "Annual",
       "min": 3,
       "max": 5,
       "label": "Agree 3-5 meaningful goals for the year",
       "hint": "These are large tangible goals that will make you a better well rounded talent professional. Cover a mix of Business Impact, Development, Behaviour and Career. For each goal: objective, why it matters, success measures, target date and support required.",
       "required": false,
       "key": "agree-3-5-meaningful-goals-for-the-year"
      }
     ]
    },
    {
     "key": "development-plan",
     "title": "Development Plan",
     "blocks": [
      {
       "type": "prompt",
       "label": "Development plan",
       "hint": "Discuss and agree: skills to develop, learning opportunities, stretch projects, mentoring or coaching, training or qualifications, cross-functional exposure and manager support.",
       "required": false,
       "key": "development-plan"
      }
     ]
    },
    {
     "key": "success-this-year",
     "title": "Success This Year",
     "blocks": [
      {
       "type": "prompt",
       "label": "By the end of the year, what would make you look back and say it was a successful year?",
       "hint": "",
       "required": false,
       "key": "by-the-end-of-the-year-what-would-make-y"
      }
     ]
    },
    {
     "key": "agreed-commitments",
     "title": "Agreed Commitments",
     "blocks": [
      {
       "type": "prompt",
       "label": "Employee commitments",
       "hint": "",
       "required": false,
       "key": "employee-commitments"
      },
      {
       "type": "prompt",
       "label": "Manager commitments",
       "hint": "",
       "required": false,
       "key": "manager-commitments"
      }
     ]
    },
    {
     "key": "review-summary",
     "title": "Review Summary",
     "blocks": [
      {
       "type": "prompt",
       "label": "Career aspiration",
       "hint": "Agreed long-term direction.",
       "required": false,
       "key": "career-aspiration"
      },
      {
       "type": "prompt",
       "label": "Annual development focus",
       "hint": "The key skills and experiences to build over the next 12 months.",
       "required": false,
       "key": "annual-development-focus"
      },
      {
       "type": "prompt",
       "label": "Annual goals summary",
       "hint": "Agreed priorities that will be reviewed during quarterly PDPs.",
       "required": false,
       "key": "annual-goals-summary"
      },
      {
       "type": "prompt",
       "label": "Success measures",
       "hint": "How progress and success will be assessed throughout the year.",
       "required": false,
       "key": "success-measures"
      }
     ]
    }
   ]
  },
  "BiAnnual": {
   "schema": 1,
   "sections": [
    {
     "key": "employee-prep",
     "title": "Employee Prep",
     "blocks": [
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What are you most proud of from the last six months?",
       "hint": "",
       "required": false,
       "key": "what-are-you-most-proud-of-from-the-last"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What have been your biggest achievements and contributions?",
       "hint": "Focus on impact rather than activity.",
       "required": false,
       "key": "what-have-been-your-biggest-achievements"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What have you learned or developed?",
       "hint": "Skills, behaviours, experiences, knowledge.",
       "required": false,
       "key": "what-have-you-learned-or-developed"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What challenges have you faced?",
       "hint": "How were they overcome and what support would have helped?",
       "required": false,
       "key": "what-challenges-have-you-faced"
      }
     ]
    },
    {
     "key": "performance-review",
     "title": "Performance Review",
     "blocks": [
      {
       "type": "prompt",
       "label": "How have you contributed to the success of your team, clients or the business?",
       "hint": "Looking back.",
       "required": false,
       "key": "how-have-you-contributed-to-the-success"
      },
      {
       "type": "goalReview",
       "by": "meeting",
       "label": "Which goals have been achieved?",
       "hint": "Goal, status and evidence / impact.",
       "required": false,
       "key": "which-goals-have-been-achieved"
      },
      {
       "type": "prompt",
       "label": "What behaviours have you demonstrated particularly well?",
       "hint": "Momentum behaviours.",
       "required": false,
       "key": "what-behaviours-have-you-demonstrated-pa"
      },
      {
       "type": "prompt",
       "label": "What behaviours would you like to strengthen?",
       "hint": "",
       "required": false,
       "key": "what-behaviours-would-you-like-to-streng"
      },
      {
       "type": "prompt",
       "label": "Top 5 achievements",
       "hint": "",
       "required": false,
       "key": "top-5-achievements"
      },
      {
       "type": "prompt",
       "label": "Impact",
       "hint": "Evidence.",
       "required": false,
       "key": "impact"
      },
      {
       "type": "prompt",
       "label": "Behaviours demonstrated",
       "hint": "Examples demonstrated.",
       "required": false,
       "key": "behaviours-demonstrated"
      },
      {
       "type": "prompt",
       "label": "Growth",
       "hint": "Skills developed.",
       "required": false,
       "key": "growth"
      },
      {
       "type": "prompt",
       "label": "Future",
       "hint": "Career aspirations.",
       "required": false,
       "key": "future"
      }
     ]
    },
    {
     "key": "manager-prep",
     "title": "Manager Prep",
     "blocks": [
      {
       "type": "prepQuestion",
       "by": "manager",
       "label": "Impact",
       "hint": "Assess with evidence.",
       "required": false,
       "key": "impact-2"
      },
      {
       "type": "prepQuestion",
       "by": "manager",
       "label": "Behaviours",
       "hint": "Assess with evidence.",
       "required": false,
       "key": "behaviours"
      },
      {
       "type": "prepQuestion",
       "by": "manager",
       "label": "Capability",
       "hint": "Assess with evidence.",
       "required": false,
       "key": "capability"
      },
      {
       "type": "prepQuestion",
       "by": "manager",
       "label": "Potential",
       "hint": "Assess with evidence.",
       "required": false,
       "key": "potential"
      }
     ]
    },
    {
     "key": "performance-scoring",
     "title": "Performance Scoring",
     "blocks": [
      {
       "type": "scoring",
       "label": "Score each pillar 1-3 against the framework descriptors for the level",
       "hint": "Self and blind manager scoring, with a written rationale per pillar.",
       "required": true,
       "key": "score-each-pillar-1-3-against-the-framew"
      }
     ]
    },
    {
     "key": "progression",
     "title": "Progression",
     "blocks": [
      {
       "type": "prompt",
       "label": "Progression readiness",
       "hint": "Are you ready for the next level?",
       "required": false,
       "key": "progression-readiness"
      }
     ]
    },
    {
     "key": "looking-forward-h2",
     "title": "Looking Forward (H2)",
     "blocks": [
      {
       "type": "prompt",
       "label": "Priorities",
       "hint": "What are the most important outcomes for the next six months?",
       "required": false,
       "key": "priorities"
      },
      {
       "type": "prompt",
       "label": "Development focus",
       "hint": "What are the top 1-3 development priorities for H2?",
       "required": false,
       "key": "development-focus"
      },
      {
       "type": "prompt",
       "label": "Support required",
       "hint": "What support, exposure or opportunities are needed?",
       "required": false,
       "key": "support-required"
      },
      {
       "type": "goalSet",
       "level": "H2",
       "min": 3,
       "max": 3,
       "label": "H2 goals",
       "hint": "For each goal: objective, what success looks like and target date.",
       "required": false,
       "key": "h2-goals"
      }
     ]
    },
    {
     "key": "commitments",
     "title": "Commitments",
     "blocks": [
      {
       "type": "prompt",
       "label": "Employee commitments",
       "hint": "",
       "required": false,
       "key": "employee-commitments"
      },
      {
       "type": "prompt",
       "label": "Manager commitments",
       "hint": "",
       "required": false,
       "key": "manager-commitments"
      }
     ]
    },
    {
     "key": "review-outcome",
     "title": "Review Outcome",
     "blocks": [
      {
       "type": "prompt",
       "label": "Overall reflection: what has gone well?",
       "hint": "",
       "required": false,
       "key": "overall-reflection-what-has-gone-well"
      },
      {
       "type": "prompt",
       "label": "What should be prioritised next?",
       "hint": "",
       "required": false,
       "key": "what-should-be-prioritised-next"
      },
      {
       "type": "prompt",
       "label": "What are the agreed focus areas for H2?",
       "hint": "",
       "required": false,
       "key": "what-are-the-agreed-focus-areas-for-h2"
      }
     ]
    }
   ]
  },
  "Quarterly": {
   "schema": 1,
   "sections": [
    {
     "key": "pre-work-employee",
     "title": "Pre-work (Employee)",
     "blocks": [
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "Biggest achievement this quarter",
       "hint": "Complete 48 hours before the review.",
       "required": false,
       "key": "biggest-achievement-this-quarter"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "Biggest challenge",
       "hint": "",
       "required": false,
       "key": "biggest-challenge"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What am I most proud of?",
       "hint": "",
       "required": false,
       "key": "what-am-i-most-proud-of"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "Where have I had the greatest impact?",
       "hint": "",
       "required": false,
       "key": "where-have-i-had-the-greatest-impact"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "How have I performed against KPIs?",
       "hint": "",
       "required": false,
       "key": "how-have-i-performed-against-kpis"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What have I learned?",
       "hint": "",
       "required": false,
       "key": "what-have-i-learned"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What skill am I developing?",
       "hint": "",
       "required": false,
       "key": "what-skill-am-i-developing"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "Where do I need support?",
       "hint": "",
       "required": false,
       "key": "where-do-i-need-support"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What is my longer-term aspiration?",
       "hint": "",
       "required": false,
       "key": "what-is-my-longer-term-aspiration"
      },
      {
       "type": "prepQuestion",
       "by": "employee",
       "label": "What experiences do I need next?",
       "hint": "",
       "required": false,
       "key": "what-experiences-do-i-need-next"
      },
      {
       "type": "goalReview",
       "by": "employee",
       "label": "Goal review",
       "hint": "Traffic light each goal: Green - on track, Amber - at risk, Red - off track.",
       "required": false,
       "key": "goal-review"
      }
     ]
    },
    {
     "key": "part-1-reflection",
     "title": "Part 1 - Reflection",
     "blocks": [
      {
       "type": "prompt",
       "label": "Wins",
       "hint": "",
       "required": false,
       "key": "wins"
      },
      {
       "type": "prompt",
       "label": "Challenges",
       "hint": "",
       "required": false,
       "key": "challenges"
      },
      {
       "type": "prompt",
       "label": "Learning",
       "hint": "",
       "required": false,
       "key": "learning"
      }
     ]
    },
    {
     "key": "part-2-impact-review",
     "title": "Part 2 - Impact Review",
     "blocks": [
      {
       "type": "prompt",
       "label": "What changed because of your work?",
       "hint": "This is about impact, not activity. Think high level, not KPIs.",
       "required": false,
       "key": "what-changed-because-of-your-work"
      },
      {
       "type": "prompt",
       "label": "What outcomes did you influence?",
       "hint": "",
       "required": false,
       "key": "what-outcomes-did-you-influence"
      },
      {
       "type": "prompt",
       "label": "Where did you create real value?",
       "hint": "",
       "required": false,
       "key": "where-did-you-create-real-value"
      }
     ]
    },
    {
     "key": "part-3-development",
     "title": "Part 3 - Development",
     "blocks": [
      {
       "type": "prompt",
       "label": "Skills gained",
       "hint": "",
       "required": false,
       "key": "skills-gained"
      },
      {
       "type": "prompt",
       "label": "Skills required",
       "hint": "",
       "required": false,
       "key": "skills-required"
      },
      {
       "type": "prompt",
       "label": "Experiences needed",
       "hint": "",
       "required": false,
       "key": "experiences-needed"
      },
      {
       "type": "prompt",
       "label": "Stretch opportunities",
       "hint": "",
       "required": false,
       "key": "stretch-opportunities"
      }
     ]
    },
    {
     "key": "part-4-goal-refresh-and-kpi-review",
     "title": "Part 4 - Goal Refresh and KPI Review",
     "blocks": [
      {
       "type": "goalReview",
       "by": "meeting",
       "label": "Review current goals and see how on track you are",
       "hint": "",
       "required": false,
       "key": "review-current-goals-and-see-how-on-trac"
      },
      {
       "type": "goalSet",
       "level": "Quarterly",
       "min": 1,
       "max": 5,
       "label": "Set next quarter goals",
       "hint": "Set next quarter goals to make sure you're on track for the half year.",
       "required": false,
       "key": "set-next-quarter-goals"
      },
      {
       "type": "prompt",
       "label": "Quarterly KPIs and improvements for next quarter",
       "hint": "Look at quarterly KPIs and what improvements can be made next quarter.",
       "required": false,
       "key": "quarterly-kpis-and-improvements-for-next"
      }
     ]
    },
    {
     "key": "part-5-commitments",
     "title": "Part 5 - Commitments",
     "blocks": [
      {
       "type": "actions",
       "max": 6,
       "label": "Employee and manager actions",
       "hint": "Name an owner and a due date for each action.",
       "required": false,
       "key": "employee-and-manager-actions"
      },
      {
       "type": "prompt",
       "label": "Support needed",
       "hint": "",
       "required": false,
       "key": "support-needed"
      }
     ]
    }
   ]
  },
  "Monthly": {
   "schema": 1,
   "sections": [
    {
     "key": "looking-back",
     "title": "Looking Back",
     "blocks": [
      {
       "type": "prompt",
       "label": "What did you commit to?",
       "hint": "",
       "required": false,
       "key": "what-did-you-commit-to"
      },
      {
       "type": "prompt",
       "label": "What happened?",
       "hint": "",
       "required": false,
       "key": "what-happened"
      },
      {
       "type": "prompt",
       "label": "What got in the way?",
       "hint": "",
       "required": false,
       "key": "what-got-in-the-way"
      }
     ]
    },
    {
     "key": "growth-focus",
     "title": "Growth Focus",
     "blocks": [
      {
       "type": "prompt",
       "label": "Choose ONE development topic that matches your bi-annual / annual goals",
       "hint": "Examples: stakeholder management, commercial thinking, candidate experience, leadership, influencing, presentation skills. Deep dive into one topic.",
       "required": false,
       "key": "choose-one-development-topic-that-matche"
      }
     ]
    },
    {
     "key": "progression",
     "title": "Progression",
     "blocks": [
      {
       "type": "prompt",
       "label": "Are you getting the experiences needed?",
       "hint": "",
       "required": false,
       "key": "are-you-getting-the-experiences-needed"
      },
      {
       "type": "prompt",
       "label": "What additional exposure do you need?",
       "hint": "",
       "required": false,
       "key": "what-additional-exposure-do-you-need"
      },
      {
       "type": "prompt",
       "label": "Who can help?",
       "hint": "",
       "required": false,
       "key": "who-can-help"
      }
     ]
    },
    {
     "key": "actions",
     "title": "Actions",
     "blocks": [
      {
       "type": "actions",
       "max": 3,
       "label": "Actions",
       "hint": "Maximum 3 actions. Named owner. Due date.",
       "required": false,
       "key": "actions"
      }
     ]
    }
   ]
  }
 }
};