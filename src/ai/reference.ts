// Reference catalogues for the simulation (synthetic, not an official coding list).
// Procedures and diagnoses feed the facility's claim form. `experiences` are lay descriptions the
// simulated AI drafter may reuse; they are reference text awaiting clinician validation, and codes
// without one get only a generic draft. The experience dictionary itself lives in the database.

export interface ProcedureRef {
  code: string;
  name: string;
  category: string;
  experiences?: string[];
  avoidTerms?: string[];
}

export interface DiagnosisRef {
  code: string;
  name: string;
}

export const PROCEDURES: ProcedureRef[] = [
  { code: '99.05', name: 'Transfusi trombosit', category: 'Darah' },
  { code: '99.04', name: 'Transfusi sel darah merah (PRC)', category: 'Darah',
    experiences: ['Cairan merah pekat dari kantong darah dialirkan lewat selang di tangan', 'Petugas mencocokkan label kantong darah sebelum dipasang'],
    avoidTerms: ['transfusi', 'PRC', 'packed red cell'] },
  { code: '88.76', name: 'USG abdomen', category: 'Penunjang' },
  { code: '88.72', name: 'Ekokardiografi', category: 'Penunjang' },
  { code: '89.52', name: 'Elektrokardiogram (EKG)', category: 'Penunjang',
    experiences: ['Beberapa stiker atau penjepit kabel ditempel di dada, tangan, dan kaki', 'Diminta berbaring diam sebentar sementara mesin mencetak garis-garis'],
    avoidTerms: ['EKG', 'elektrokardiogram', 'elektroda'] },
  { code: '90.59', name: 'Pemeriksaan darah lengkap', category: 'Laboratorium' },
  { code: '87.03', name: 'CT scan kepala', category: 'Radiologi' },
  { code: '87.44', name: 'Foto rontgen dada', category: 'Radiologi' },
  { code: '93.96', name: 'Terapi oksigen', category: 'Tindakan' },
  { code: '93.94', name: 'Terapi inhalasi (nebulizer)', category: 'Tindakan',
    experiences: ['Menghirup uap obat dari masker kecil yang tersambung ke mesin berbunyi', 'Uap keluar dari masker selama beberapa menit'],
    avoidTerms: ['nebulizer', 'nebulisasi', 'inhalasi'] },
  { code: '99.18', name: 'Infus cairan elektrolit', category: 'Tindakan',
    experiences: ['Selang di tangan tersambung ke kantong cairan bening yang digantung', 'Kantong cairan diganti beberapa kali selama dirawat'],
    avoidTerms: ['infus', 'intravena', 'elektrolit', 'IV'] },
  { code: '57.94', name: 'Pemasangan kateter urin', category: 'Tindakan',
    experiences: ['Selang dipasang untuk buang air kecil sehingga tidak perlu ke kamar mandi', 'Air kencing tertampung di kantong yang digantung di sisi tempat tidur'],
    avoidTerms: ['kateter', 'urin', 'foley'] },
  { code: '93.39', name: 'Fisioterapi motorik', category: 'Rehabilitasi' },
  { code: '39.95', name: 'Hemodialisis', category: 'Tindakan Khusus' },
  { code: '36.06', name: 'Pemasangan stent koroner', category: 'Tindakan Jantung' },
  { code: '13.41', name: 'Fakoemulsifikasi katarak', category: 'Tindakan Mata' },
  { code: '74.1', name: 'Sectio caesarea', category: 'Tindakan' },
  { code: '03.91', name: 'Anestesi spinal', category: 'Anestesi',
    experiences: ['Disuntik di punggung bagian bawah sambil duduk membungkuk', 'Setelah disuntik, kaki terasa kebas dan berat untuk beberapa jam'],
    avoidTerms: ['anestesi', 'spinal', 'regional', 'blok'] },
  { code: '47.09', name: 'Apendektomi', category: 'Operasi',
    experiences: ['Dibius lalu menjalani operasi di kamar operasi', 'Setelah bangun ada luka jahitan atau plester di perut kanan bawah'],
    avoidTerms: ['apendektomi', 'apendisitis', 'appendix', 'usus buntu'] },
  { code: '86.22', name: 'Debridemen luka', category: 'Tindakan' },
];

export const DIAGNOSES: DiagnosisRef[] = [
  { code: 'A91', name: 'Demam berdarah dengue' },
  { code: 'A01.0', name: 'Demam tifoid' },
  { code: 'O82.0', name: 'Persalinan dengan sectio caesarea elektif' },
  { code: 'M54.5', name: 'Nyeri punggung bawah' },
  { code: 'J18.9', name: 'Pneumonia, tidak spesifik' },
  { code: 'I21.9', name: 'Infark miokard akut' },
  { code: 'I20.0', name: 'Angina tidak stabil' },
  { code: 'N18.5', name: 'Penyakit ginjal kronik stadium 5' },
  { code: 'K35.8', name: 'Apendisitis akut' },
  { code: 'H25.9', name: 'Katarak senilis' },
  { code: 'E11.9', name: 'Diabetes melitus tipe 2' },
  { code: 'J45.9', name: 'Asma' },
  { code: 'I10', name: 'Hipertensi esensial' },
  { code: 'L03.1', name: 'Selulitis ekstremitas' },
];

export function findProcedure(code: string): ProcedureRef | undefined {
  return PROCEDURES.find((p) => p.code === code);
}

export function findDiagnosis(code: string): DiagnosisRef | undefined {
  return DIAGNOSES.find((d) => d.code === code);
}
