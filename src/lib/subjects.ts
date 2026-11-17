export type AcademicSubject = {
  id: string;
  name: string;
  code: string;
  description: string;
  isDefault: boolean;
  topics: string[];
};

export const CORE_SUBJECTS: AcademicSubject[] = [
  {
    id: "informatics",
    name: "Informatics",
    code: "INF",
    description: "Information systems, human-computer interaction, data modeling, and socio-technical computing.",
    isDefault: true,
    topics: ["Information Systems", "Data Modeling", "HCI & Usability", "Systems Analysis"],
  },
  {
    id: "computer-science",
    name: "Computer Science",
    code: "CSC",
    description: "Algorithms, data structures, operating systems, databases, networks, and software engineering.",
    isDefault: true,
    topics: ["Data Structures", "Algorithms", "Operating Systems", "Computer Networks", "Databases"],
  },
  {
    id: "environmental-science-and-health",
    name: "Environmental Science and Health",
    code: "ESH",
    description: "Ecology, environmental toxicology, public health epidemiology, waste management, and sustainability.",
    isDefault: true,
    topics: ["Environmental Health", "Toxicology", "Ecology & Ecosystems", "Water & Sanitation"],
  },
  {
    id: "information-management-and-technology",
    name: "Information Management and Technology",
    code: "IMT",
    description: "Enterprise IT governance, knowledge management, cloud architecture, and cybersecurity.",
    isDefault: true,
    topics: ["IT Governance", "Enterprise Architecture", "Information Security", "Knowledge Systems"],
  },
  {
    id: "radiography",
    name: "Radiography",
    code: "RAD",
    description: "Medical imaging physics, radiation protection, radiographic anatomy, CT/MRI, and patient care.",
    isDefault: true,
    topics: ["Radiation Physics", "Radiographic Anatomy", "Imaging Modalities", "Radiation Protection"],
  },
  {
    id: "agribusiness-economics-and-management",
    name: "Agribusiness Economics and Management",
    code: "AEM",
    description: "Agricultural markets, farm enterprise finance, supply chains, resource economics, and policy.",
    isDefault: true,
    topics: ["Agricultural Markets", "Farm Finance", "Supply Chain Management", "Resource Economics"],
  },
  {
    id: "business-analytics",
    name: "Business Analytics",
    code: "BAN",
    description: "Statistical forecasting, decision modeling, predictive analytics, BI visualization, and optimization.",
    isDefault: true,
    topics: ["Descriptive Statistics", "Predictive Modeling", "Optimization", "Business Intelligence"],
  },
  {
    id: "applied-physics",
    name: "Applied Physics",
    code: "PHY",
    description: "Mechanics, electromagnetism, optics, thermodynamics, quantum applications, and instrumentation.",
    isDefault: true,
    topics: ["Classical Mechanics", "Electromagnetism", "Optics & Waves", "Thermodynamics"],
  },
  {
    id: "biotechnology",
    name: "Biotechnology",
    code: "BTC",
    description: "Molecular genetics, recombinant DNA, bioprocess engineering, immunology, and bioinformatics.",
    isDefault: true,
    topics: ["Molecular Biology", "Genetic Engineering", "Bioprocessing", "Bioinformatics"],
  },
];

export function slugifySubject(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}

export function matchSubjectName(raw: string | null | undefined, allNames: string[]): string {
  const val = (raw ?? "").trim();
  if (!val) return "General";
  const lower = val.toLowerCase();
  const exact = allNames.find((n) => n.toLowerCase() === lower);
  if (exact) return exact;
  const partial = allNames.find(
    (n) => lower.includes(n.toLowerCase()) || n.toLowerCase().includes(lower),
  );
  return partial ?? val;
}
