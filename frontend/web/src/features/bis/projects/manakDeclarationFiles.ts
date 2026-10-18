import type { BisProjectViewFile } from './bisProjectFilesApi'

export type DeclarationFile = { id: string; fileName: string; storagePath: string }
export type DeclarationSupportingRow = { id: string; fileName: string; upload: DeclarationFile | null }
export type SupportingDeclarationKind = 'otherInformation' | 'otherRequest'

export const declarationFileFromProjectFile = (file: BisProjectViewFile): DeclarationFile => ({ id: file.id, fileName: file.file_name, storagePath: file.storage_path })
export const declarationFileToProjectFile = (file: DeclarationFile): BisProjectViewFile => ({ id: file.id, file_name: file.fileName, storage_path: file.storagePath })
