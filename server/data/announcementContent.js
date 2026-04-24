export const semesterKeyDates = {
  requestClose: "31 Jan 2026",
  addDropClose: "31 Jan 2026",
  resultCheckWindow: "20–25 Feb 2026",
  lotteryPublish: "1 Feb 2026",
  supportContact: "Faculty Office",
};

export const selectionSchedule = [
  ["18 Dec 2025", "Online enrolment system opens for course preview."],
  ["19–31 Dec 2025", "Enrolment period for all MSc(Eng) students."],
];

export const addDropSchedule = [
  ["19 Jan 2026", "Second semester begins (first day of teaching)."],
  ["19–31 Jan 2026", "Students can add or drop courses online."],
  ["After 31 Jan 2026", "The online Add / Drop function closes. Further changes require faculty handling."],
  [
    "20–25 Feb 2026",
    "Students should check their course selection records online. Any discrepancy should be reported to the Department / Faculty Office no later than 25 Feb 2026. This is not an extended Add / Drop period.",
  ],
  [
    "From 26 Feb 2026",
    "Enrolment records are treated as final and used for examination entry.",
  ],
];

export const nominalStudyLoad = [
  ["CIVIL", "MSc(Eng)(CivE)", "4 courses (24 credits)", "3 courses (18 credits)"],
  ["", "MSc(Eng)(IEM)", "4 courses (24 credits)", "3 courses (18 credits)"],
  ["DASE", "MSc(Eng)(IELM)", "5 courses (30 credits)", "3 courses (18 credits)"],
  ["", "MSc(Eng)(RIS)", "5 courses (30 credits)", "3 courses (18 credits)"],
  ["EEE", "MSc(Eng)(EEE)", "4 courses (24 credits)", "3 courses (18 credits)"],
  ["", "MSc(Eng)(EnergyE)", "4 courses (24 credits)", "3 courses (18 credits)"],
  ["ME", "MSc(Eng)(BSE)", "5 courses (30 credits)", "3 courses (18 credits)"],
  ["", "MSc(Eng)(IDT)", "5 courses (30 credits)", "3 courses (18 credits)"],
  ["", "MSc(Eng)(ME)", "5 courses (30 credits)", "3 courses (18 credits)"],
  ["", "MSc(Eng)(MEST)", "5 courses (30 credits)", "3 courses (18 credits)"],
  ["", "MSc(Eng)(LAT)", "5 courses (30 credits)", "N/A"],
];

export const guidelineBlocks = [
  {
    title: "1.1 Course Registration",
    body: [
      "Students can register for courses according to the enrolment schedule through the online enrolment system which can be accessed through the link below:",
    ],
    link: {
      href: "https://engg.hku.hk/Teaching-Learning/MSc/Course-Selection",
      label: "https://engg.hku.hk/Teaching-Learning/MSc/Course-Selection",
    },
  },
  {
    title: "1.2 Information on Course Enrolment",
    body: ["Please check the following information on the system from December onwards:"],
    bullets: ["Teaching timetable", "Regulations and Syllabuses for each programme"],
  },
  {
    title: "1.3 Nominal Study Load Per Semester",
    body: [
      "To complete the programme, students shall select courses according to the guidelines stipulated in the respective regulations and syllabuses for the degree of MSc(Eng).",
      "Please note the nominal study load per semester for each programme as specified. It is important to strictly adhere to the approved study load when enrolling in courses. If students wish to enrol in a workload exceeding the approved nominal study load, they must seek approval from the respective TPg Programme Director or Department Head.",
    ],
  },
  {
    title: "1.4 Course Add / Drop",
    body: [
      "Students can add and drop courses during the designated Add / Drop period for each semester.",
      "After the Add / Drop period, requests to add or drop from courses are generally not permitted, except under extenuating circumstances. Students must submit a detailed justification to the Department. The application requires support from the Department Head / Programme Director and endorsement by the Associate Dean (Masters).",
    ],
    emphasis:
      "All requests must be submitted before the end of the reading / field trip week (or no later than halfway through the teaching activities in the semester). Submissions received after this deadline will NOT be considered.",
  },
  {
    title: "1.5 Selection of Courses",
    body: [
      "Students are advised to enrol in courses in the stipulated enrolment period.",
      "There is a quota for each class. Selection of courses is subject to the approval of the Department(s) concerned. Students should ensure that there are no clashes in timetabling of the courses selected.",
    ],
  },
  {
    title: "1.6 For MSc(Eng)(CivE)/(IEM) Programme",
    body: [
      "Unless otherwise stated, MSc(Eng)(CivE)/(IEM) students will be given priority in enrolling in courses offered by the Department of Civil Engineering.",
    ],
  },
  {
    title: "1.7 For MSc(Eng)(EEE)/(EnergyE) Programme",
    body: ["Details of the MSc(Eng)(EEE)/(EnergyE) programme requirements are available at"],
    link: {
      href: "https://www.eee.hku.hk/study/postgraduate/",
      label: "https://www.eee.hku.hk/study/postgraduate/",
    },
  },
  {
    title: "1.8 For MSc(Eng)(IELM)/(RIS) Programme",
    body: ["Details of the MSc(Eng)(IELM)/(RIS) programme requirements are available here:"],
    boxedLinks: [
      [
        "IELM",
        "https://www.dase.hku.hk/teaching-and-learning/current-students/master-of-science-in-engineering-in-industrial-engineering-and-logistics-management",
      ],
      [
        "RIS",
        "https://www.dase.hku.hk/teaching-and-learning/current-students/master-of-science-in-engineering-in-robotics-and-intelligent-systems",
      ],
    ],
  },
  {
    title: "1.9 For MSc(Eng)(BSE)/(IDT)/(ME)/(MEST)/(LAT) Programme",
    body: [
      "MSc(Eng)(BSE)/(IDT)/(ME)/(MEST)/(LAT) students will be given priority in enrolling in courses offered by the Department of Mechanical Engineering. Second-year and third-year students will be given a higher priority in course enrolment.",
      "Details of the MSc(Eng)(BSE)/(IDT)/(ME)/(MEST)/(LAT) programme requirements are available at https://www.mech.hku.hk/tpg.",
    ],
  },
];

export const announcementContent = {
  visaReminder:
    "All students without the right of abode/right to land in Hong Kong must apply for a student visa for the purpose of education from the Hong Kong Immigration Department.",
  selectionSchedule,
  addDropSchedule,
  maintenanceNotice:
    "Regular system maintenance is from 1:00pm to 2:00pm every Wednesday. The online enrolment system service may not be available during that period.",
  publishedBy: "Faculty of Engineering Office",
  publishedAt: "December 2025",
  keyDates: semesterKeyDates,
  highlights: [
    { label: "Selection window", value: "19–31 Dec 2025" },
    { label: "Add / Drop deadline", value: semesterKeyDates.addDropClose },
    { label: "Result check", value: semesterKeyDates.resultCheckWindow },
    { label: "Maintenance", value: "Every Wednesday, 1:00pm - 2:00pm" },
  ],
  nominalStudyLoad,
  guidelineBlocks,
};
