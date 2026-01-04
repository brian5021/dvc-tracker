"use server"

// Import repositories
import { PointSummaryRepository } from "./repository/point-summary-repository"
import { MemberRepository } from "./repository/member-repository"
import { StayRepository } from "./repository/stay-repository"
import { TransferRepository } from "./repository/transfer-repository"
import { DatabaseRepository } from "./repository/database-repository"

// Import validators
import { StayValidator } from "./validators/stay-validator"
import { TransferValidator } from "./validators/transfer-validator"

// Import services
import { PointService } from "./services/point-service"
import { StayService } from "./services/stay-service"
import { TransferService } from "./services/transfer-service"
import { BankingService } from "./services/banking-service"

// Initialize repositories
const pointSummaryRepository = new PointSummaryRepository()
const memberRepository = new MemberRepository()
const stayRepository = new StayRepository()
const transferRepository = new TransferRepository()
const databaseRepository = new DatabaseRepository()

// Initialize validators
const stayValidator = new StayValidator(memberRepository)
const transferValidator = new TransferValidator(memberRepository)

// Initialize services
const pointService = new PointService(pointSummaryRepository, memberRepository)
const transferService = new TransferService(transferRepository, memberRepository, transferValidator)
const bankingService = new BankingService(memberRepository, pointSummaryRepository)
// Update StayService initialization to include TransferService and MemberRepository
const stayService = new StayService(stayRepository, pointService, stayValidator, transferService, memberRepository)

// Export public API - ensure all functions are async

// Point summary and member points
export async function getPointSummary() {
  return pointService.getPointSummary()
}

export async function getMemberPoints() {
  return pointService.getMemberPoints()
}

// Stay management
export async function getStays() {
  return stayService.getStays()
}

export async function addStay(stay: any) {
  return stayService.addStay(stay)
}

export async function updateStay(stayId: string, updatedStay: any) {
  return stayService.updateStay(stayId, updatedStay)
}

export async function deleteStay(stayId: string) {
  return stayService.deleteStay(stayId)
}

// Transfer management
export async function getTransfers() {
  return transferService.getTransfers()
}

export async function addTransfer(transfer: any) {
  return transferService.addTransfer(transfer)
}

export async function updateTransferStatus(transferId: string, status: "Active" | "Returned") {
  return transferService.updateTransferStatus(transferId, status)
}

// Banking and expiration
export async function bankPoints(memberName: any, pointsToBankCount: number) {
  return bankingService.bankPoints(memberName, pointsToBankCount)
}

export async function processContractYearRollover() {
  return bankingService.processContractYearRollover()
}

export async function processExpiredPoints() {
  return bankingService.processExpiredPoints()
}

// Keep only the initialize database function
export async function initializeDatabase() {
  return databaseRepository.initialize()
}
