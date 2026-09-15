import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

export class RegisterLocalUserDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  username!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(128)
  password?: string

  /** Kept only for direct in-memory test fixtures; never accepted by ValidationPipe. */
  passwordHash?: string

  @IsString()
  @IsNotEmpty()
  displayName!: string
}
