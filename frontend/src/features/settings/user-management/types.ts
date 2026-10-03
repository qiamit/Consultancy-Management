export type UserAccount = {
  id: string
  name: string
  email: string
  mobile: string
  password: string
  designation: string
  departmentName: string
  division: string
  status: 'Active' | 'Inactive'
}

export type UserForm = {
  name: string
  email: string
  mobile: string
  password: string
  designation: string
  department: string
  division: string
  status: 'Active' | 'Inactive'
}

export const emptyUserForm: UserForm = {
  name: '',
  email: '',
  mobile: '',
  password: '',
  designation: '',
  department: '',
  division: '',
  status: 'Active',
}
